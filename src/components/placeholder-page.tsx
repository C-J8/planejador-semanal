type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <>
      <h1>{title}</h1>
      <p>Em construção</p>
    </>
  );
}
