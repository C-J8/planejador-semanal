"use client";

export default function TrackingError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section className="tracking-page">
      <div className="empty-state" role="alert">
        <h1>Não foi possível carregar o acompanhamento</h1>
        <p>Os dados não puderam ser consultados. Tente novamente.</p>
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
