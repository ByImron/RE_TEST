-- ============================================================
-- РАЗОВЫЙ СКРИПТ (не часть 000_full_setup.sql, повторно запускать не нужно).
--
-- Для договоров, у которых клиент заплатил вперёд, а программа показывает
-- его должником на целый платёж. Это следы старой ошибки блока 077 (она
-- исправлена блоком 085): триггер переплаты раскладывал остаток по всем
-- будущим срокам, включая ближайший, который платёж уже закрыл.
--
-- Что делает исправление: пересобирает неоплаченный график договора от даты
-- договора (так же, как кнопка «Вернуть график» на странице «Должники»).
-- Внесённые платежи не трогаются, а поступившие деньги снова ложатся на
-- график по очереди, поэтому клиент, который опережает график, перестаёт
-- быть должником. Прежний график сохраняется в crm.schedule_backup. Кнопки
-- «Отменить возврат» после этого скрипта в программе НЕТ (она бывает только
-- после возврата через страницу «Должники»): вернуть прежний график можно по
-- запросу к разработчику.
--
-- ПОРЯДОК.
--   1. Запустите 000_full_setup.sql целиком (блок 085) -- если ещё не запускали.
--   2. Выполните ШАГ 1 -- он только показывает, ничего не меняет.
--   3. Посмотрите список. Договоры, где график переносили сознательно
--      (договорённость с клиентом, «Пересчитать график», новая сумма
--      договора), чинить не нужно -- тогда этот скрипт не для вас.
--   4. В ШАГЕ 2 впишите в v_expected число строк, которое показал шаг 1, и
--      выполните его. Шаг 2 исправляет ровно те договоры, что в списке шага 1
--      (номера вписывать не нужно -- латиница и кириллица в номерах путаются).
--      Если список изменился и число не совпало, он остановится и ничего не
--      тронет.
-- ============================================================


-- ============ ШАГ 1. Кого можно исправить (только просмотр) ============
-- Показаны договоры, у которых по датам самого договора просрочка МЕНЬШЕ,
-- чем сейчас: то есть клиент платил, а график этого не учёл.
with cand as (
  select c.id, c.number, c.currency::text as currency, c.paid_amount,
         coalesce(cl.name, '—') as client_name
  from crm.contracts c
  left join crm.clients cl on cl.id = c.client_id
  where c.payment_type in ('installment', 'rent')
    and c.status <> 'cancelled'
    and c.installment_months > 0
    and c.amount > c.paid_amount
),
restored as (
  select cd.id,
         coalesce(sum(
           least(b.amount, greatest(b.cum - greatest(cd.paid_amount - b.down, 0), 0))
         ) filter (where b.due_date < current_date), 0) as overdue
  from cand cd
  cross join lateral crm.contract_baseline_plan(cd.id) b
  group by cd.id
),
now_ as (
  select oi.contract_id as id, sum(oi.unpaid_amount) as overdue
  from crm.overdue_installments oi
  where oi.due_date < current_date and oi.unpaid_amount > 0.005
  group by oi.contract_id
),
last_pay as (
  select distinct on (p.contract_id)
         p.contract_id as id,
         coalesce(p.paid_date, p.due_date) as paid_on,
         p.amount
  from crm.contract_payments p
  where p.paid
  order by p.contract_id, coalesce(p.paid_date, p.due_date) desc, p.created_at desc nulls last
),
rebalanced as (
  select a.entity_id as id, max(a.created_at)::date as on_date
  from crm.audit_log a
  where a.entity_type = 'contract' and a.details ->> 'schedule_rebalanced' = 'true'
  group by a.entity_id
)
select cd.number                                   as "Договор",
       cd.client_name                              as "Клиент",
       cd.currency                                 as "Валюта",
       n.overdue                                   as "Просрочено сейчас",
       r.overdue                                   as "По датам договора",
       lp.paid_on                                  as "Последний платёж",
       lp.amount                                   as "Сумма платежа",
       rb.on_date                                  as "График пересобран автоматически"
from cand cd
join now_ n      on n.id = cd.id
join restored r  on r.id = cd.id
left join last_pay lp   on lp.id = cd.id
left join rebalanced rb on rb.id = cd.id
where n.overdue > r.overdue + crm.debt_tolerance()
order by n.overdue desc;


-- ============ ШАГ 2. Исправить договоры из списка шага 1 ============
-- Впишите в v_expected число строк, которое показал шаг 1. Пока там 0 или число
-- не совпадает со списком шага 1, скрипт ничего не меняет.
do $$
declare
  v_expected integer := 0;   -- <<< СКОЛЬКО ДОГОВОРОВ ПОКАЗАЛ ШАГ 1
  v_ids uuid[];
  v_id uuid;
  v_number text;
  v_rows integer;
begin
  if v_expected < 1 then
    raise exception 'Впишите в v_expected число строк, которое показал шаг 1. Ничего не изменено.';
  end if;

  -- Те же договоры, что показывает шаг 1: просрочка по датам договора меньше, чем сейчас.
  select array_agg(x.id order by x.number), count(*)::int
    into v_ids, v_rows
  from (
    with cand as (
      select c.id, c.number, c.paid_amount
      from crm.contracts c
      where c.payment_type in ('installment', 'rent')
        and c.status <> 'cancelled'
        and c.installment_months > 0
        and c.amount > c.paid_amount
    ),
    restored as (
      select cd.id,
             coalesce(sum(
               least(b.amount, greatest(b.cum - greatest(cd.paid_amount - b.down, 0), 0))
             ) filter (where b.due_date < current_date), 0) as overdue
      from cand cd
      cross join lateral crm.contract_baseline_plan(cd.id) b
      group by cd.id
    ),
    now_ as (
      select oi.contract_id as id, sum(oi.unpaid_amount) as overdue
      from crm.overdue_installments oi
      where oi.due_date < current_date and oi.unpaid_amount > 0.005
      group by oi.contract_id
    )
    select cd.id, cd.number
    from cand cd
    join now_ n on n.id = cd.id
    join restored r on r.id = cd.id
    where n.overdue > r.overdue + crm.debt_tolerance()
  ) x;

  -- Защита: чинится ровно столько, сколько вы видели в шаге 1.
  if coalesce(v_rows, 0) <> v_expected then
    raise exception 'Шаг 1 сейчас показывает % договоров, а ожидалось %. Ничего не изменено.', coalesce(v_rows, 0), v_expected;
  end if;

  foreach v_id in array v_ids loop
    select number into v_number from crm.contracts where id = v_id;

    perform set_config('crm.audit_off', 'on', true);

    insert into crm.schedule_backup (contract_id, due_date, amount, reason)
    select contract_id, due_date, amount, 'restore_schedule'
    from crm.contract_payments where contract_id = v_id and not paid;

    delete from crm.contract_payments where contract_id = v_id and not paid;

    insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
    select v_id, b.due_date, b.amount, false, null
    from crm.contract_baseline_plan(v_id) b;
    get diagnostics v_rows = row_count;

    perform set_config('crm.audit_off', 'off', true);

    insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
    values (
      null, 'update', 'contract', v_id,
      jsonb_build_object(
        'schedule_restored', true,
        'schedule_payments', v_rows,
        'repair', 'prepaid_rebalance',
        '_context', crm.audit_context('contract', v_id)
      )
    );
    raise notice 'Договор %: график пересобран от даты договора (% строк)', v_number, v_rows;
  end loop;
end
$$;
