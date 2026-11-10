"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Menunda pemasangan (dan import dinamis) anak sampai wadahnya mendekati viewport.
 * Dipakai untuk konten berat seperti kanvas 3D agar tidak membebani muatan awal halaman.
 */
export function LazyMount({ children, className, rootMargin = "200px" }: { children: React.ReactNode; className?: string; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setShow(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShow(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return (
    <div ref={ref} className={className}>
      {show ? children : <div className="h-full w-full animate-pulse rounded-2xl bg-zinc-900" />}
    </div>
  );
}
