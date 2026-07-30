import { createAdminClient } from "@/lib/supabase/admin";
import { formatTime } from "@/lib/format";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";
import {
  resolveDayRanges,
  SLOT_STEP_MINUTES,
  timeToMinutes,
  weekdayOf,
  type DayException,
  type MinuteRange,
} from "@/lib/availability";
import { ENCAIXE_DAY_END, ENCAIXE_DAY_START } from "@/lib/encaixe";

export type AgendaProfessionalColumn = {
  id: string;
  nickname: string;
  photoUrl: string | null;
  photoPosition: string;
  commissionPercent: number;
  serviceIds: string[];
  availableRanges: MinuteRange[];
  blockRanges: MinuteRange[];
};

export type ScheduleBlockItem = {
  id: string;
  professionalId: string;
  professionalNickname: string;
  startTime: string;
  endTime: string;
  note: string;
};

export type AgendaDayContext = {
  gridStart: number;
  gridEnd: number;
  slotStepMinutes: number;
  shopClosed: boolean;
  scheduleBlocks: ScheduleBlockItem[];
  professionals: AgendaProfessionalColumn[];
};

function toDayException(e: {
  kind: string;
  start_time: string | null;
  end_time: string | null;
}): DayException {
  return {
    kind: e.kind as "closed" | "custom",
    range:
      e.kind === "custom" && e.start_time && e.end_time
        ? {
            start: timeToMinutes(e.start_time),
            end: timeToMinutes(e.end_time),
          }
        : null,
  };
}

function roundDown(minutes: number, step: number): number {
  return Math.floor(minutes / step) * step;
}

function roundUp(minutes: number, step: number): number {
  return Math.ceil(minutes / step) * step;
}

export async function getAgendaDayContext(
  date: string,
  professionalIds: string[],
  shopId: string
): Promise<AgendaDayContext> {
  const admin = createAdminClient();
  if (!admin || !shopId) {
    return {
      gridStart: ENCAIXE_DAY_START,
      gridEnd: ENCAIXE_DAY_END,
      slotStepMinutes: SLOT_STEP_MINUTES,
      shopClosed: false,
      scheduleBlocks: [],
      professionals: [],
    };
  }

  const { data: settings } = await admin
    .from("shops")
    .select("slot_step_minutes")
    .eq("id", shopId)
    .maybeSingle();

  const slotStepMinutes = settings?.slot_step_minutes ?? SLOT_STEP_MINUTES;

  if (professionalIds.length === 0) {
    return {
      gridStart: ENCAIXE_DAY_START,
      gridEnd: ENCAIXE_DAY_END,
      slotStepMinutes,
      shopClosed: false,
      scheduleBlocks: [],
      professionals: [],
    };
  }

  const weekday = weekdayOf(date);

  const [
    { data: businessDay },
    { data: exceptions },
    { data: workingHours },
    { data: professionals },
    { data: rawBlocks },
  ] = await Promise.all([
    admin
      .from("business_hours")
      .select("active, open_time, close_time")
      .eq("shop_id", shopId)
      .eq("weekday", weekday)
      .maybeSingle(),
    admin
      .from("schedule_exceptions")
      .select("professional_id, kind, start_time, end_time")
      .eq("shop_id", shopId)
      .eq("date", date),
    admin
      .from("working_hours")
      .select("professional_id, start_time, end_time")
      .eq("weekday", weekday)
      .in("professional_id", professionalIds),
    admin
      .from("professionals")
      .select(
        "id, nickname, photo_url, photo_position, commission_percent, professional_services(service_id)"
      )
      .eq("shop_id", shopId)
      .in("id", professionalIds)
      .order("nickname"),
    admin
      .from("schedule_blocks")
      .select(
        "id, professional_id, start_time, end_time, note, professionals ( nickname )"
      )
      .eq("shop_id", shopId)
      .eq("date", date)
      .in("professional_id", professionalIds)
      .order("start_time"),
  ]);

  const scheduleBlocks: ScheduleBlockItem[] = (rawBlocks ?? []).map((b) => {
    const rawPro = b.professionals as
      | { nickname: string }
      | { nickname: string }[]
      | null;
    const nickname = Array.isArray(rawPro)
      ? rawPro[0]?.nickname
      : rawPro?.nickname;

    return {
    id: b.id,
    professionalId: b.professional_id,
    professionalNickname: nickname ?? "—",
    startTime: formatTime(b.start_time),
    endTime: formatTime(b.end_time),
    note: b.note,
  };
  });

  const blocksByProfessional = new Map<string, MinuteRange[]>();
  for (const block of rawBlocks ?? []) {
    const ranges = blocksByProfessional.get(block.professional_id) ?? [];
    ranges.push({
      start: timeToMinutes(block.start_time),
      end: timeToMinutes(block.end_time),
    });
    blocksByProfessional.set(block.professional_id, ranges);
  }

  const shopException =
    (exceptions ?? []).find((e) => e.professional_id === null) ?? null;

  const shopWindow: MinuteRange | null = shopException
    ? shopException.kind === "closed"
      ? null
      : shopException.start_time && shopException.end_time
        ? {
            start: timeToMinutes(shopException.start_time),
            end: timeToMinutes(shopException.end_time),
          }
        : null
    : businessDay?.active
      ? {
          start: timeToMinutes(businessDay.open_time),
          end: timeToMinutes(businessDay.close_time),
        }
      : null;

  const shopClosed = !shopWindow;

  const columns: AgendaProfessionalColumn[] = (professionals ?? []).map((pro) => {
    const proException =
      (exceptions ?? []).find((e) => e.professional_id === pro.id) ?? null;

    const weeklyRanges = (workingHours ?? [])
      .filter((wh) => wh.professional_id === pro.id)
      .map((wh) => ({
        start: timeToMinutes(wh.start_time),
        end: timeToMinutes(wh.end_time),
      }));

    const availableRanges = resolveDayRanges({
      businessDay: businessDay
        ? {
            active: businessDay.active,
            range: {
              start: timeToMinutes(businessDay.open_time),
              end: timeToMinutes(businessDay.close_time),
            },
          }
        : null,
      shopException: shopException ? toDayException(shopException) : null,
      weeklyRanges,
      professionalException: proException ? toDayException(proException) : null,
    });

    return {
      id: pro.id,
      nickname: pro.nickname,
      photoUrl: pro.photo_url,
      photoPosition: normalizePhotoPosition(
        pro.photo_position ?? DEFAULT_PHOTO_POSITION
      ),
      commissionPercent: pro.commission_percent ?? 50,
      serviceIds: (pro.professional_services ?? []).map((ps) => ps.service_id),
      availableRanges,
      blockRanges: blocksByProfessional.get(pro.id) ?? [],
    };
  });

  // Grade só no expediente (união dos horários dos profissionais / loja).
  // Encaixe fora do expediente continua pelo formulário dedicado.
  let gridStart: number;
  let gridEnd: number;

  if (shopClosed) {
    gridStart = 0;
    gridEnd = 0;
  } else {
    const rangeBounds = columns.flatMap((column) => column.availableRanges);
    const boundSource =
      rangeBounds.length > 0
        ? rangeBounds
        : shopWindow
          ? [shopWindow]
          : [{ start: ENCAIXE_DAY_START, end: ENCAIXE_DAY_END }];

    gridStart = roundDown(
      Math.min(...boundSource.map((range) => range.start)),
      slotStepMinutes
    );
    gridEnd = roundUp(
      Math.max(...boundSource.map((range) => range.end)),
      slotStepMinutes
    );

    if (gridEnd <= gridStart) {
      gridStart = 0;
      gridEnd = 0;
    }
  }

  return {
    gridStart,
    gridEnd,
    slotStepMinutes,
    shopClosed,
    scheduleBlocks,
    professionals: columns,
  };
}
