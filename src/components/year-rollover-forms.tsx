type Year = { id: string; year: number; startsOn: Date; endsOn: Date; closedAt: Date | null };
type Classroom = { id: string; name: string; schoolYear: number; capacity: number };
type StaffMember = { id: string; role: string; user: { displayName: string } };

export function YearRolloverForms({ years, classrooms, staff, action }: { years: Year[]; classrooms: Classroom[]; staff: StaffMember[]; action: string }) {
  return <section className="mt-5 rounded-3xl border border-violet-200 bg-violet-50 p-6">
    <h2 className="font-display text-xl font-bold">Virada do ano letivo</h2>
    <p className="mt-1 text-sm text-slate-700">A operação encerra as matrículas do ano de origem e cria somente as turmas marcadas. A equipe precisa ser escolhida novamente. Vínculos familiares já pertencem ao cadastro da criança e permanecem; consentimentos, publicações e conteúdos não são copiados.</p>
    {years.filter((year) => !year.closedAt).map((year) => {
      const sourceClasses = classrooms.filter((item) => item.schoolYear === year.year);
      const targetYear = year.year + 1;
      return <form key={year.id} action={action} method="post" className="mt-5 space-y-4 rounded-2xl border border-violet-200 bg-white p-5">
        <input type="hidden" name="action" value="year:rollover"/><input type="hidden" name="sourceYearId" value={year.id}/>
        <h3 className="font-bold">Encerrar {year.year} e abrir {targetYear}</h3>
        <div className="grid gap-3 sm:grid-cols-3"><label className="field-label">Novo ano<input className="field-input" type="number" name="year" min={targetYear} max="2200" defaultValue={targetYear} required/></label><label className="field-label">Início<input className="field-input" type="date" name="startsOn" defaultValue={`${targetYear}-01-01`} required/></label><label className="field-label">Fim<input className="field-input" type="date" name="endsOn" defaultValue={`${targetYear}-12-31`} required/></label></div>
        <fieldset className="space-y-2"><legend className="font-semibold">Turmas que serão criadas no novo ano</legend>{sourceClasses.length ? sourceClasses.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr]"><label className="flex items-center gap-2"><input type="checkbox" name="classroomId" value={item.id}/><span>{item.name} · capacidade {item.capacity}</span></label><label className="field-label">Equipe validada para a nova turma<select className="field-input" name={`staff:${item.id}`} defaultValue=""><option value="">Escolher depois</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.user.displayName} · {member.role}</option>)}</select></label></div>) : <p className="text-sm text-slate-600">Não há turmas ativas neste ano para duplicar.</p>}</fieldset>
        <label className="flex items-start gap-2 text-sm"><input type="hidden" name="carryStudents" value="false"/><input type="checkbox" name="carryStudents" value="true"/><span>Transferir matrículas ativas e lista de espera das turmas marcadas. Se uma criança tiver mais de uma turma de origem, marque todas elas.</span></label>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">As matrículas que não forem transferidas serão encerradas no fim do ano {year.year}. A equipe não é copiada automaticamente. A operação não pode ser desfeita pela interface.</p>
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" name="confirm" value="yes" required/><span>Confirmo o fechamento do ano {year.year} e a abertura do novo ano.</span></label>
        <button className="button-primary" disabled={!sourceClasses.length}>Concluir virada de ano</button>
      </form>;
    })}
  </section>;
}
