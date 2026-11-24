import { Camera, LayoutDashboard, ScanFace, UserPlus } from 'lucide-react';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import DynamicSections from './DynamicSections.jsx';

export default function EntryPortal({ navigate }) {
  const { config } = useSiteConfig();

  const rawPortalTitle = config.portalTitle;
  const portalTitle =
    !rawPortalTitle || rawPortalTitle === 'Portal Presensi & Counting Wajah'
      ? 'Presensi Wajah'
      : rawPortalTitle;

  const rawHeading = config.portalHeading;
  const portalHeading =
    !rawHeading || rawHeading === 'Silakan pilih tujuan penggunaan hari ini.'
      ? 'Pilih Ruang'
      : rawHeading;

  const rawGerejaTitle = config.workspaces?.gereja?.title;
  const gerejaTitle =
    !rawGerejaTitle || rawGerejaTitle === 'Presensi & Counting Jemaat' ? 'Gereja' : rawGerejaTitle;

  const rawPilotingTitle = config.workspaces?.piloting?.title;
  const pilotingTitle =
    !rawPilotingTitle || rawPilotingTitle === 'Piloting & Pengujian' ? 'Piloting' : rawPilotingTitle;

  const cards = [
    {
      key: 'gereja',
      title: gerejaTitle,
      imageSrc: '/assets/church.png',
      imageAlt: 'Gereja',
      stageClass: 'bg-white',
      imgClass: 'max-h-40 w-auto object-contain',
      livePath: '/gereja/live',
      registerPath: '/gereja/register',
      primaryLabel: 'Kamera',
    },
    {
      key: 'piloting',
      title: pilotingTitle,
      imageSrc: '/assets/code.png',
      imageAlt: 'Piloting',
      stageClass: 'bg-black',
      imgClass: 'max-h-40 w-full object-contain',
      livePath: '/piloting/live',
      registerPath: '/piloting/register',
      primaryLabel: 'Kamera',
    },
    {
      key: 'testing',
      title: 'Testing',
      imageSrc: null,
      imageAlt: 'Testing Kamera',
      stageClass: 'bg-zinc-900 text-zinc-100',
      imgClass: '',
      livePath: '/testing/live',
      registerPath: '/piloting/register',
      primaryLabel: 'Kamera',
    },
  ];

  return (
    <div className="min-h-screen bg-base-200 text-base-content flex flex-col">
      {/* PrimeVue-inspired Minimal Header */}
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="text-sm font-semibold tracking-tight text-base-content">
            {portalTitle}
          </span>

          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content transition hover:bg-base-200"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Admin</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-base-content sm:text-2xl">
            {portalHeading}
          </h1>
        </div>

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.key}
              className="flex flex-col overflow-hidden rounded-md border border-base-300 bg-base-100 shadow-sm transition hover:border-base-content/30"
            >
              {/* Clean Visual Header */}
              <button
                type="button"
                onClick={() => navigate(card.livePath)}
                className={`flex h-48 w-full cursor-pointer items-center justify-center border-b border-base-300 p-4 transition hover:opacity-95 ${card.stageClass}`}
                title={`Buka ${card.title}`}
              >
                {card.imageSrc ? (
                  <img src={card.imageSrc} alt={card.imageAlt} className={card.imgClass} />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <ScanFace className="h-12 w-12 text-emerald-400" strokeWidth={1.6} />
                    <span className="font-mono text-xs tracking-widest text-zinc-400">
                      LIVE TEST
                    </span>
                  </div>
                )}
              </button>

              {/* PrimeVue Card Body & Footer */}
              <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                <h2 className="text-base font-semibold text-base-content">{card.title}</h2>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(card.livePath)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-700"
                  >
                    <Camera className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{card.primaryLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(card.registerPath)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content transition hover:bg-base-200"
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0" />
                    <span>Registrasi</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>

        <DynamicSections target="portal" onNavigate={navigate} />
      </main>
    </div>
  );
}
