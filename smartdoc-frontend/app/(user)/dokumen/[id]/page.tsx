import DocumentDetails from "@/components/workspace/DocumentDetails";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tool?: string }> }) {
  const { id } = await params;
  const { tool } = await searchParams;
  return <DocumentDetails key={id} id={id} initialTool={tool} />;
}
