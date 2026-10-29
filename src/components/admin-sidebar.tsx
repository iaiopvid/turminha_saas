"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Building2, CalendarCheck, Camera, ClipboardList, Home, Menu, MessageCircle, Settings, Users, X } from "lucide-react";

const items = [
  { label: "Visão geral", path: "dashboard", icon: Home },
  { label: "Minha turma", path: "turma", icon: Users },
  { label: "Diário", path: "diario", icon: ClipboardList },
  { label: "Frequência", path: "frequencia", icon: CalendarCheck },
  { label: "Gestão escolar", path: "gestao-escolar", icon: Building2 },
  { label: "Pedagogia", path: "pedagogia", icon: BookOpen },
  { label: "Memórias", path: "midias", icon: Camera },
  { label: "Mensagens", path: "comunicados", icon: MessageCircle },
  { label: "Configurações", path: "configuracoes", icon: Settings },
];

export function AdminSidebar({ slug, active, schoolName, displayName }: { slug: string; active: string; schoolName: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => { setMobile(query.matches); if (!query.matches) setOpen(false); };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobile || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); toggleRef.current?.focus(); return; }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((node) => node.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [mobile, open]);

  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) requestAnimationFrame(() => toggleRef.current?.focus()); };
  return <>
    <button ref={toggleRef} id="admin-menu-toggle" className="admin-menu-toggle" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={mobile && open} aria-controls="admin-sidebar" onClick={() => setOpen((value) => !value)}>{open ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}<span>Menu</span></button>
    {mobile && open && <div className="drawer-backdrop" aria-hidden="true" onClick={() => close()}/>}
    <aside ref={sidebarRef} id="admin-sidebar" className={`admin-sidebar ${mobile && open ? "admin-sidebar-open" : ""}`} aria-label="Navegação da escola" aria-modal={mobile && open ? true : undefined} role={mobile && open ? "dialog" : undefined} aria-hidden={mobile && !open} inert={mobile && !open}>
      <div className="admin-drawer-heading"><Link href={`/app/${slug}/dashboard`} className="admin-brand" onClick={() => close(false)}><span className="admin-brand-icon" aria-hidden="true">✿</span><span className="font-display text-3xl font-bold">Turminha</span><span className="admin-role-tag">ESPAÇO DA ESCOLA</span></Link><button ref={closeRef} type="button" className="admin-drawer-close" aria-label="Fechar menu" onClick={() => close()}><X aria-hidden="true"/></button></div>
      <div className="admin-identity"><span className="admin-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{schoolName}</small></span></div>
      <nav aria-label="Menu da escola" className="admin-nav">{items.map(({ label, path, icon: Icon }) => <Link key={path} aria-current={active === path ? "page" : undefined} className={`admin-nav-link ${active === path ? "active" : ""}`} href={`/app/${slug}/${path}`} onClick={() => close(false)}><Icon size={19} aria-hidden="true"/><span>{label}</span></Link>)}</nav>
      <div className="admin-sidebar-note" aria-hidden="true"><span>☁</span><span>✦</span><strong>Aprender<br/>com carinho</strong></div>
      <form className="admin-logout" action="/api/auth/signout" method="post"><button type="submit">Sair da conta</button></form>
    </aside>
  </>;
}
