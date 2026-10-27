"use client";

import Link from "next/link";
import { useState } from "react";
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
  return <>
    <button className="admin-menu-toggle" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}<span>Menu</span></button>
    {open && <button className="drawer-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)}/>}
    <aside className={`admin-sidebar ${open ? "admin-sidebar-open" : ""}`}>
      <Link href={`/app/${slug}/dashboard`} className="admin-brand"><span className="admin-brand-icon">✿</span><span className="font-display text-3xl font-bold">Turminha</span><span className="admin-role-tag">ESPAÇO DA ESCOLA</span></Link>
      <div className="admin-identity"><span className="admin-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{schoolName}</small></span></div>
      <nav aria-label="Menu da escola" className="admin-nav">{items.map(({ label, path, icon: Icon }) => <Link key={path} aria-current={active === path ? "page" : undefined} className={`admin-nav-link ${active === path ? "active" : ""}`} href={`/app/${slug}/${path}`} onClick={() => setOpen(false)}><Icon size={19}/><span>{label}</span></Link>)}</nav>
      <div className="admin-sidebar-note" aria-hidden="true"><span>☁</span><span>✦</span><strong>Aprender<br/>com carinho</strong></div>
      <form className="admin-logout" action="/api/auth/signout" method="post"><button type="submit">Sair da conta</button></form>
    </aside>
  </>;
}
