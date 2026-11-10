import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-mono text-6xl font-black text-lime-400">404</p>
      <p className="mt-4 text-zinc-400">Halaman tidak ditemukan / Page not found</p>
      <Link href="/" className="btn-primary mt-6">
        ← IronVision 3D
      </Link>
    </div>
  );
}
