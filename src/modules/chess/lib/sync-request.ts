// HTTP import has a 90s limit and persistence a 30s transaction limit.
// A lost response must not leave the button disabled forever.
export async function waitForChessSync<T>(
  request: Promise<T>,
  timeoutMs = 150000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            "A confirmação demorou mais que o esperado. A sincronização pode ainda terminar no servidor; consulte a última atualização antes de tentar novamente.",
          );
          error.name = "ChessSyncTimeoutError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
