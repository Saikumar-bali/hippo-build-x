import postgres from 'postgres';

const sql = postgres('postgres://postgres:Hippo@123@localhost:5432/hippo_build');

try {
  const result = await sql`SELECT 1 as test`;
  console.log('DB connection OK:', result);
} catch (e) {
  console.error('DB Error:', e.message);
} finally {
  await sql.end();
}
