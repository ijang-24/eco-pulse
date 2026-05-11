const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Seed Point Configs
  const configs = [
    { waste_type: 'plastic', points_per_kg: 25, co2_factor: 2.5, tree_factor: 0 },
    { waste_type: 'paper', points_per_kg: 15, co2_factor: 1.5, tree_factor: 0.017 },
    { waste_type: 'metal', points_per_kg: 40, co2_factor: 3.5, tree_factor: 0 },
    { waste_type: 'glass', points_per_kg: 10, co2_factor: 0.5, tree_factor: 0 },
    { waste_type: 'organic', points_per_kg: 5, co2_factor: 0.8, tree_factor: 0 },
  ];

  for (const config of configs) {
    await prisma.point_configs.upsert({
      where: { waste_type: config.waste_type },
      update: config,
      create: config,
    });
  }

  // Seed Rewards
  const rewards = [
    { title: 'Voucher Sembako Rp 25k', description: 'Tukarkan poinmu dengan paket sembako murah.', points_cost: 500, stock: 50 },
    { title: 'Token Listrik 20k', description: 'Bantuan token listrik untuk warga hemat energi.', points_cost: 450, stock: 30 },
    { title: 'Voucher Pulsa 10k', description: 'Pulsa gratis untuk tetap terhubung.', points_cost: 250, stock: 100 },
  ];

  for (const reward of rewards) {
    await prisma.rewards.create({
      data: reward,
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
