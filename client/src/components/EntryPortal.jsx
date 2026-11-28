import { Camera, LayoutDashboard, ScanFace, UserPlus } from 'lucide-react';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import { WorkspaceIcon } from './BrandLogo.jsx';
import DynamicSections from './DynamicSections.jsx';
import ThemePicker from './ThemePicker.jsx';

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
      ? 'Pilih Ruang Kerja'
      : rawHeading;

  const rawGerejaTitle = config.workspaces?.gereja?.title;
  const gerejaTitle =
    !rawGerejaTitle || rawGerejaTitle === 'Presensi & Counting Jemaat' ? 'Gereja' : rawGerejaTitle;

  const rawPilotingTitle = config.workspaces?.piloting?.title;
  const pilotingTitle =
    !rawPilotingTitle || rawPilotingTitle === 'Piloting & Pengujian' ? 'Piloting' : rawPilotingTitle;

  const rawTestingTitle = config.workspaces?.testing?.title;
  const testingTitle =
    !rawTestingTitle || rawTestingTitle === 'Testing Kamera' ? 'Testing' : rawTestingTitle;

  const cards = [
    {
      key: 'gereja',
      title: gerejaTitle,
      description: 'Presensi jemaat, pendeta, majelis & pelayan ibadah.',
      livePath: '/gereja/live',
      registerPath: '/gereja/register',
      adminPath: '/gereja/admin',
    },
    {
      key: 'piloting',
      title: pilotingTitle,
      description: 'Simulasi presensi dan uji operasional harian.',
      livePath: '/piloting/live',
      registerPath: '/piloting/register',
      adminPath: '/piloting/admin',
    },
    {
      key: 'testing',
      title: testingTitle,
      description: 'Uji kamera dan kalibrasi deteksi wajah terpisah.',
      livePath: '/testing/live',
      registerPath: '/testing/register',
      adminPath: '/testing/admin',
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-base-200 text-base-content flex flex-col">
      <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ScanFace className="h-5 w-5" strokeWidth={2} />
            </div>
            <span className="truncate text-base font-bold tracking-tight text-base-content">
              {portalTitle}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemePicker compact />
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="btn btn-sm h-10 px-4 btn-outline border-base-300 text-sm font-semibold gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Admin</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-start sm:justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl font-bold text-base-content sm:text-2xl">
            {portalHeading}
          </h1>
          <p className="mt-1.5 text-sm text-base-content/75 sm:text-base">
            Pilih ruang di bawah ini. Data anggota dan laporan tiap ruang tersimpan terpisah.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.key}
              className="card mi-card-interactive border border-base-300 bg-base-100"
            >
              <div className="card-body justify-between gap-6 p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => navigate(card.livePath)}
                    aria-label={`Buka Kamera ${card.title}`}
                    className="icon-button flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                    title={`Buka Kamera ${card.title}`}
                  >
                    <WorkspaceIcon workspace={card.key} className="h-6 w-6" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-base-content leading-snug">
                      {card.title}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-base-content/75">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(card.livePath)}
                      className="btn h-11 min-h-11 btn-primary gap-2 text-sm font-semibold"
                    >
                      <Camera className="h-4 w-4 shrink-0" />
                      <span>Kamera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(card.registerPath)}
                      className="btn h-11 min-h-11 btn-outline border-base-300 gap-2 text-sm font-semibold"
                    >
                      <UserPlus className="h-4 w-4 shrink-0" />
                      <span>Daftar</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(card.adminPath)}
                    className="btn btn-sm h-10 w-full btn-ghost justify-between border border-base-300/80 bg-base-200/70 px-4 text-sm font-medium text-base-content/85 hover:bg-base-200"
                  >
                    <span>Kelola Data {card.title}</span>
                    <LayoutDashboard className="h-4 w-4 text-primary" />
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
