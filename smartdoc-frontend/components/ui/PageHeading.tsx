export default function PageHeading({ title, accent, description }: { title: string; accent?: string; description?: string }) {
  return <header className="ui-page-heading">
    <h1>{title}{accent && <> <span>{accent}</span></>}</h1>
    {description && <p>{description}</p>}
  </header>;
}
