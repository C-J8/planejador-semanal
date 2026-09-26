import "dotenv/config";
import { syncChessProgress } from "@/modules/chess/services/chess-progress";
import { prisma } from "@/shared/lib/prisma";

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error("Uso: npm run chess:sync -- seu-usuario");
  const count = await syncChessProgress(username);
  console.log(`Chess.com atualizado: ${count} partidas avaliadas importadas.`);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Falha na sincronização.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
