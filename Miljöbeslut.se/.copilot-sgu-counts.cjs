const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const TABLES = [
  'env.sgu_groundwater_magazine',
  'env.sgu_groundwater_body',
  'env.sgu_landslide_feature',
  'env.sgu_well',
  'env.sgu_well_actual',
  'env.sgu_coastal_erosion_erosionsskydd',
  'env.sgu_coastal_erosion_vattenyta_prognos',
  'env.sgu_highest_coastline_hk_yta'
];
async function getCounts() {
  const out = {};
  for (const fullName of TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS count FROM ${fullName}`);
      out[fullName] = Number(rows?.[0]?.count ?? 0);
    } catch (e) {
      out[fullName] = { error: String(e.message || e) };
    }
  }
  return out;
}
async function main() {
  const phase = process.argv[2] || 'before';
  const counts = await getCounts();
  console.log(JSON.stringify({ phase, counts }, null, 2));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
