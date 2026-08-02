"use client";

export function ResourceError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section className="empty-state" role="alert">
      <h1>Não foi possível carregar este recurso</h1>
      <p>Nenhuma alteração foi realizada. Tente carregar os dados novamente.</p>
      <button
        className="button primary"
        type="button"
        onClick={() => unstable_retry()}
      >
        Tentar novamente
      </button>
    </section>
  );
}
