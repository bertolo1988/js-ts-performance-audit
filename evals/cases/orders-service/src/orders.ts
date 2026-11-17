import { readFileSync } from 'node:fs';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from './db';
import { fetchRate } from './rates';

type Item = { id: string; orderId: string; sku: string; quantity: number };
type Order = { id: string; customerId: string; currency: string; total: number; items?: Item[] };

const SUPPORTED_FLAGS = ['beta', 'audit', 'export'];

// Runs once, when the process starts.
export function loadConfig(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const flags: Record<string, boolean> = {};
  SUPPORTED_FLAGS.forEach((name) => {
    flags[name] = raw.flags?.[name] === true;
  });
  return { ...raw, flags };
}

function verifyApiKey(key: string, salt: string, expected: Buffer): boolean {
  const hash = pbkdf2Sync(key, salt, 210_000, 32, 'sha256');
  return timingSafeEqual(hash, expected);
}

// GET /customers/:id/orders
export async function listOrders(req: Request, res: Response) {
  const account = await db.accounts.findByKeyId(req.header('x-key-id'));
  if (!account || !verifyApiKey(req.header('x-api-key') ?? '', account.salt, account.keyHash)) {
    return res.status(401).end();
  }

  const orders: Order[] = await db.orders.findMany({ where: { customerId: req.params.id } });
  for (const order of orders) {
    order.items = await db.items.findMany({ where: { orderId: order.id } });
  }

  let totalUsd = 0;
  for (const order of orders) {
    const rate = await fetchRate(order.currency, 'USD');
    totalUsd += order.total * rate;
  }

  res.json({ orders, totalUsd });
}

// Called by the nightly report with every order in the system.
export function totalsByCustomer(orders: Order[]) {
  return orders.reduce(
    (acc, order) => ({ ...acc, [order.customerId]: (acc[order.customerId] ?? 0) + order.total }),
    {} as Record<string, number>,
  );
}

export function vipOrders(orders: Order[], vipCustomerIds: string[]) {
  return orders.filter((order) => vipCustomerIds.includes(order.customerId));
}

export function snapshot(orders: Order[]) {
  return orders.map((order) => JSON.parse(JSON.stringify(order)));
}

export function countItems(orders: Order[]) {
  let count = 0;
  orders.forEach((order) => {
    count += order.items?.length ?? 0;
  });
  return count;
}

// POST /exports. `orderIds` comes from the request body and can hold every order of a tenant.
export async function exportOrders(orderIds: string[]) {
  return Promise.all(
    orderIds.map((id) => fetch(`https://warehouse.internal/orders/${id}`).then((response) => response.json())),
  );
}
