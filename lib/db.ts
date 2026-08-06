// 푸시 구독 정보 저장용 DB 연결. 검사한 URL은 여기에도 절대 담지 않는다 (CLAUDE.md 절대 규칙 5) —
// 저장하는 건 브라우저가 발급한 푸시 구독(endpoint/keys)뿐이다.

import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

let tableReady: Promise<void> | null = null;

/** push_subscriptions 테이블이 없으면 만든다. 매 요청마다 호출해도 안전하도록 캐싱한다. */
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS push_subscriptions (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           endpoint TEXT UNIQUE NOT NULL,
           p256dh TEXT NOT NULL,
           auth TEXT NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      )
      .then(() => undefined);
  }
  return tableReady;
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 구독 정보를 저장하고(이미 있으면 갱신) 구독 id를 반환한다. */
export async function saveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<string> {
  await ensureTable();
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
     RETURNING id`,
    [endpoint, p256dh, auth]
  );
  return result.rows[0].id;
}

/** id로 구독 정보를 조회한다. 없으면 null. */
export async function findSubscription(id: string): Promise<StoredSubscription | null> {
  await ensureTable();
  const result = await getPool().query<StoredSubscription>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/** 구독을 삭제한다 (알림 끄기, 또는 발송 실패로 더 이상 유효하지 않을 때). */
export async function deleteSubscription(id: string): Promise<void> {
  await ensureTable();
  await getPool().query(`DELETE FROM push_subscriptions WHERE id = $1`, [id]);
}
