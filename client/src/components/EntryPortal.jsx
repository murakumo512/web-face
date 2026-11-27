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
      <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-box border border-base-300 bg-base-200 text-primary">
              <ScanFace className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <span className="truncate text-sm font-semibold text-base-content">
              {portalTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemePicker compact />
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="btn btn-sm btn-outline border-base-300 font-medium gap-1.5"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Admin</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-start sm:justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-lg font-semibold text-base-content sm:text-xl">
            {portalHeading}
          </h1>
          <p className="mt-1 text-xs text-base-content/65 sm:text-sm">
            Setiap ruang memiliki data anggota dan log kehadiran yang terpisah.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.key}
              className="card border border-base-300 bg-base-100 transition-colors hover:border-base-content/25"
            >
              <div className="card-body justify-between gap-5 p-5">
                <div className="flex items-start gap-3.5">
                  <button
                    type="button"
                    onClick={() => navigate(card.livePath)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-box border border-base-300 bg-base-200 text-primary transition hover:bg-base-300/70"
                    title={`Buka Kamera ${card.title}`}
                  >
                    <WorkspaceIcon workspace={card.key} className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-base-content leading-tight">
                      {card.title}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-base-content/65">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(card.livePath)}
                      className="btn btn-sm h-10 btn-primary gap-1.5 font-medium"
                    >
                      <Camera className="h-3.5 w-3.5 shrink-0" />
                      <span>Kamera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(card.registerPath)}
                      className="btn btn-sm h-10 btn-outline border-base-300 gap-1.5 font-medium"
                    >
                      <UserPlus className="h-3.5 w-3.5 shrink-0" />
                      <span>Registrasi</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(card.adminPath)}
                    className="btn btn-xs h-8 w-full btn-ghost justify-between border border-base-200 bg-base-200/40 px-3 font-normal text-base-content/75 hover:bg-base-200"
                  >
                    <span>Kelola Data {card.title}</span>
                    <LayoutDashboard className="h-3.5 w-3.5 opacity-60" />
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
