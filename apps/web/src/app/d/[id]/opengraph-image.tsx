import { ImageResponse } from 'next/og';
import { db, schema } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = { params: Promise<{ id: string }> };

export default async function OgImage({ params }: Props) {
  const { id } = await params;
  const rows = await db
    .select({ spec: schema.dashboards.spec })
    .from(schema.dashboards)
    .where(eq(schema.dashboards.id, id))
    .limit(1);

  const spec = rows[0]?.spec;
  const title = spec?.title ?? 'DeFi Dashboard';
  const widgetTitles = spec?.widgets.slice(0, 4).map((w) => w.title) ?? [];
  const chains = spec?.chains.join(', ') ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0D0D0D 0%, #1a1a1a 100%)',
          padding: '60px 80px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              background: '#FF6B2B',
              borderRadius: 8,
              padding: '6px 14px',
              color: 'white',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            Envio
          </div>
          <span style={{ color: '#888', fontSize: 18 }}>HyperSync Dashboard</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: 'white',
            lineHeight: 1.15,
            marginBottom: 24,
          }}
        >
          {title}
        </div>

        {/* Chain pills */}
        {chains && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
            {spec?.chains.slice(0, 5).map((c) => (
              <div
                key={c}
                style={{
                  background: '#222',
                  border: '1px solid #333',
                  borderRadius: 20,
                  padding: '4px 14px',
                  color: '#aaa',
                  fontSize: 16,
                }}
              >
                chain:{c}
              </div>
            ))}
          </div>
        )}

        {/* Widget list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
          {widgetTitles.map((wt, i) => (
            <div key={i} style={{ color: '#888', fontSize: 20 }}>
              • {wt}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            right: 80,
            color: '#FF6B2B',
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          envio.dev
        </div>
      </div>
    ),
    { ...size },
  );
}
