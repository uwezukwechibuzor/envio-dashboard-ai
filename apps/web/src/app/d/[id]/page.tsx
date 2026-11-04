import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client.js';
import { db, schema } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const rows = await db.select({ spec: schema.dashboards.spec, prompt: schema.dashboards.prompt })
    .from(schema.dashboards)
    .where(eq(schema.dashboards.id, id))
    .limit(1);

  if (!rows[0]) return { title: 'Dashboard not found' };
  const title = rows[0].spec.title;
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';

  return {
    title: `${title} — Envio Dashboard AI`,
    openGraph: {
      title,
      description: rows[0].spec.description,
      images: [`${appUrl}/d/${id}/opengraph-image`],
    },
  };
}

export default async function DashboardPage({ params }: Props) {
  const { id } = await params;
  const rows = await db.select().from(schema.dashboards).where(eq(schema.dashboards.id, id)).limit(1);
  if (!rows[0]) notFound();
  const dashboard = rows[0]!;
  return <DashboardPageClient dashboard={dashboard} shareId={id} />;
}
