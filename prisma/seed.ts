import { parseLocalTime } from "../src/lib/calendar-values";
import { prisma } from "../src/lib/prisma";

const activities = [
  {
    name: "Academia",
    icon: "🏋️",
    color: "#EF4444",
    defaultDurationMinutes: 60,
    defaultStartTime: null,
  },
  {
    name: "Leitura",
    icon: "📚",
    color: "#3B82F6",
    defaultDurationMinutes: 30,
    defaultStartTime: null,
  },
  {
    name: "Sono",
    icon: "😴",
    color: "#8B5CF6",
    defaultDurationMinutes: 480,
    defaultStartTime: parseLocalTime("23:00"),
  },
];

async function main() {
  for (const activity of activities) {
    await prisma.activity.upsert({
      where: { name: activity.name },
      update: {},
      create: activity,
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Não foi possível executar o seed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
