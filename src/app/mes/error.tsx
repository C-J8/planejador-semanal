"use client";

export default function MonthError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section className="month-page">
      <div className="empty-state" role="alert">
        <h1>Não foi possível carregar o mês</h1>
        <p>
          O calendário não pôde ser consultado. Verifique o banco e tente
          novamente.
        </p>
        <button
          className="button primary"
          onClick={unstable_retry}
          type="button"
        >
          Tentar novamente
        </button>
      </div>
    </section>
  );
}
