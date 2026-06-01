import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cities = [
    {
      name: 'Delhi',
      state: 'Delhi',
      slug: 'delhi',
    },
    {
      name: 'Mumbai',
      state: 'Maharashtra',
      slug: 'mumbai',
    },
    {
      name: 'Bangalore',
      state: 'Karnataka',
      slug: 'bangalore',
    },
    {
      name: 'Hyderabad',
      state: 'Telangana',
      slug: 'hyderabad',
    },
    {
      name: 'Chennai',
      state: 'Tamil Nadu',
      slug: 'chennai',
    },
    {
      name: 'Pune',
      state: 'Maharashtra',
      slug: 'pune',
    },
    {
      name: 'Kolkata',
      state: 'West Bengal',
      slug: 'kolkata',
    },
  ];

  for (const city of cities) {
    await prisma.city.upsert({
      where: {
        slug: city.slug,
      },
      update: {},
      create: city,
    });
  }

  console.log('Cities seeded successfully');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });