import hashlib
import re
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from gym_tracker.schemas import ExercisePayload, ParseOutcome, SetPayload, WhatsAppMessage, WorkoutExtraction
from gym_tracker.services.loads import parse_load
from gym_tracker.services.normalization import (
    normalize_equipment,
    normalize_text,
    resolve_static_exercise,
)

WHATSAPP_HEADER = re.compile(
    r"(?mx)^"
    r"(?:"
    r"\[(?P<bracket_date>\d{1,2}/\d{1,2}/\d{2,4})[ ,]+"
    r"(?P<bracket_time>\d{1,2}:\d{2}(?::\d{2})?(?:[ \t\u00a0\u202f]*(?i:AM|PM))?)\]\s*(?:-\s*)?"
    r"|"
    r"(?P<plain_date>\d{1,2}/\d{1,2}/\d{2,4})[ ,]+"
    r"(?P<plain_time>\d{1,2}:\d{2}(?::\d{2})?(?:[ \t\u00a0\u202f]*(?i:AM|PM))?)\s*-\s*"
    r")"
    r"(?P<head>.*)$"
)
LOAD_PATTERN = re.compile(r"(?<!\w)(?P<load>-?\d+(?:[.,]\d+)?)\s*(?P<unit>kg|g)\b", re.IGNORECASE)
NAMELESS_LOAD_PATTERN = re.compile(
    r"^(?P<name>[^\d]{2,}?)\s+(?P<load>\d+(?:[.,]\d+)?)\s*[/|-]\s*(?P<rest>.*(?:rep|\d\s*x).*)$",
    re.IGNORECASE,
)
WORKOUT_TITLES = {
    "acad nova",
    "upper",
    "lower a",
    "lower b",
    "abd",
    "halter",
    "maquina",
    "cabo",
    "maquina com anilha",
    "maquina com anilhas",
}
EDIT_MARKERS = ("<mensagem editada>", "(editada)")
MEDIA_MARKERS = ("<midia oculta>", "<media omitted>")
NOT_PERFORMED_PATTERN = re.compile(r"(?<!\w)(?:n\s*fiz|nao\s*fiz)(?!\w)")
REPETITIONS_PATTERN = re.compile(r"(?<![\w.,])(?P<value>-?\d+(?:[.,]\d+)?)\s*(?:rep)?(?=\s*(?:[/.-]|$))")
SET_MULTIPLIER_PATTERN = re.compile(r"(?:/|\s|\.{2,})(?P<count>-?\d+)\s*x\b")
MALFORMED_LOAD_PATTERN = re.compile(
    r"(?<!\w)-?\d+(?:\.\.(?!\.)\d+|,{2,}\d+|[.,]\d+[.,]\d+)\s*(?:kg|g)\b", re.IGNORECASE
)


def content_hash(sent_at: datetime, sender: str, content: str) -> str:
    material = f"{sent_at.isoformat()}\n{normalize_text(sender)}\n{content.strip()}".encode()
    return hashlib.sha256(material).hexdigest()


def _export_date_pattern(matches: list[re.Match[str]]) -> str:
    patterns: set[str] = set()
    has_meridiem = False
    for match in matches:
        date_text = match.group("bracket_date") or match.group("plain_date")
        time_text = match.group("bracket_time") or match.group("plain_time")
        first, second, _ = map(int, date_text.split("/"))
        if first > 12:
            patterns.add("%d/%m")
        if second > 12:
            patterns.add("%m/%d")
        has_meridiem |= time_text.upper().endswith(("AM", "PM"))
    if len(patterns) > 1:
        raise ValueError("O export mistura datas dia/mes e mes/dia.")
    # Unambiguous dates determine the order for the entire export. Otherwise,
    # retain day-first for the existing format and use month-first for AM/PM.
    return next(iter(patterns)) if patterns else "%m/%d" if has_meridiem else "%d/%m"


def split_whatsapp_messages(text: str, timezone: str = "America/Sao_Paulo") -> list[WhatsAppMessage]:
    clean_text = text.replace("\ufeff", "")
    matches = list(WHATSAPP_HEADER.finditer(clean_text))
    date_pattern = _export_date_pattern(matches)
    messages: list[WhatsAppMessage] = []
    zone = ZoneInfo(timezone)

    for source_index, match in enumerate(matches):
        body_start = match.end()
        body_end = matches[source_index + 1].start() if source_index + 1 < len(matches) else len(clean_text)
        head = match.group("head")
        sender, separator, first_line = head.partition(": ")
        if not separator:
            sender, first_line = "", head
        continuation = clean_text[body_start:body_end].strip("\r\n")
        raw_content = first_line + (f"\n{continuation}" if continuation else "")
        raw_content = raw_content.strip()
        normalized = normalize_text(raw_content)
        date_text = match.group("bracket_date") or match.group("plain_date")
        time_text = match.group("bracket_time") or match.group("plain_time")
        has_meridiem = time_text.upper().endswith(("AM", "PM"))
        time_text = re.sub(r"\s*(AM|PM)$", lambda suffix: " " + suffix[1].upper(), time_text, flags=re.IGNORECASE)
        year_format = "%Y" if len(date_text.rsplit("/", 1)[-1]) == 4 else "%y"
        time_format = ("%I" if has_meridiem else "%H") + (":%M:%S" if time_text.count(":") == 2 else ":%M")
        if has_meridiem:
            time_format += " %p"
        sent_at = datetime.strptime(f"{date_text} {time_text}", f"{date_pattern}/{year_format} {time_format}").replace(
            tzinfo=zone
        )
        messages.append(
            WhatsAppMessage(
                source_index=source_index,
                source_offset=match.start(),
                sent_at=sent_at,
                timestamp_precision="second" if time_text.count(":") == 2 else "minute",
                sender_raw=sender.strip("\u200e "),
                raw_content=raw_content,
                content_sha256=content_hash(sent_at, sender, raw_content),
                is_edited=any(marker in normalized for marker in EDIT_MARKERS),
                is_deleted="mensagem apagada" in normalized or "message deleted" in normalized,
                is_media=any(marker in normalized for marker in MEDIA_MARKERS),
            )
        )
    return messages


def _strip_markers(content: str) -> str:
    return re.sub(r"<(?:Mensagem editada|Mídia oculta|Media omitted)>", "", content, flags=re.IGNORECASE)


def prepare_training_lines(content: str) -> tuple[str | None, list[str]]:
    workout_type: str | None = None
    lines: list[str] = []

    for raw_line in _strip_markers(content).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        normalized = normalize_text(line)
        if normalized in WORKOUT_TITLES:
            workout_type = line
            continue
        if "mensagem apagada" in normalized:
            continue
        is_punctuated_continuation = line.startswith(("...", "..", "."))
        is_reps_only_continuation = bool(re.fullmatch(r"(?:\d+\s*(?:rep|ep)?\s*[/.-]*\s*)+", normalized))
        if lines and _is_clear_continuation(line) and (is_punctuated_continuation or is_reps_only_continuation):
            separator = " " if is_punctuated_continuation else " ... "
            lines[-1] = f"{lines[-1]}{separator}{line}"
            continue
        lines.append(line)
    return workout_type, lines


def _is_clear_continuation(line: str) -> bool:
    normalized = normalize_text(line)
    return bool(LOAD_PATTERN.search(line) or re.fullmatch(r"[. /-]*(?:\d+\s*(?:rep)?[ /.-]*)+", normalized))


def _expand_repetitions(segment: str) -> tuple[list[int], list[str]]:
    normalized = segment.casefold().strip()
    normalized = re.sub(r"(\d+)\s*ep\b", r"\1rep", normalized)
    multipliers = list(SET_MULTIPLIER_PATTERN.finditer(normalized))
    cleaned = SET_MULTIPLIER_PATTERN.sub("", normalized)
    reps: list[int] = []
    reasons: list[str] = []
    for match in REPETITIONS_PATTERN.finditer(cleaned):
        value = Decimal(match.group("value").replace(",", "."))
        if value != value.to_integral_value() or not 1 <= value <= 200:
            reasons.append(f"repeticoes ausentes ou invalidas: {match.group('value')}")
        else:
            reps.append(int(value))
    remainder = REPETITIONS_PATTERN.sub("", cleaned)
    if re.search(r"[^\s/.-]", remainder):
        reasons.append("repeticoes ausentes ou invalidas: trecho nao reconhecido")

    shorthand = re.fullmatch(r"[\s/.-]*(\d+)\s*rep\s*/\s*(\d+)[\s.]*", normalized)
    if shorthand and 1 <= int(shorthand.group(2)) <= 5:
        # This could mean separate sets or a repetition multiplier. Keep the
        # original line for review instead of proposing either interpretation.
        return [], [*reasons, "abreviacao de repeticoes ambigua"]
    if multipliers:
        if len(multipliers) != 1 or len(reps) != 1:
            reasons.append("abreviacao de repeticoes ambigua")
        else:
            count = int(multipliers[0].group("count"))
            if not 1 <= count <= 200:
                reasons.append("repeticoes ausentes ou invalidas: multiplicador fora do limite")
            elif not reasons:
                reps *= count
    return reps, list(dict.fromkeys(reasons))


def parse_set_line(line: str) -> tuple[str, list[SetPayload], list[str]]:
    normalized = normalize_text(line)
    if NOT_PERFORMED_PATTERN.search(normalized):
        return "", [], []

    cleaned = re.sub(r"\([^)]*\)", "", line)
    malformed_load = MALFORMED_LOAD_PATTERN.search(cleaned)
    if malformed_load:
        return cleaned[: malformed_load.start()].strip(" -:"), [], ["carga invalida: notacao numerica ambigua"]
    load_matches = list(LOAD_PATTERN.finditer(cleaned))
    reasons: list[str] = []

    if not load_matches:
        chunks = [chunk.strip() for chunk in re.split(r"\.{2,}", cleaned) if chunk.strip()]
        without_unit = NAMELESS_LOAD_PATTERN.match(chunks[0]) if chunks else None
        if without_unit is None:
            return "", [], ["linha de treino nao reconhecida"]
        raw_name = without_unit.group("name").strip(" -:")
        reasons.append("carga sem unidade")
        parsed_without_unit: list[SetPayload] = []
        continuation_pattern = re.compile(
            r"^(?P<load>\d+(?:[.,]\d+)?)\s*[/|-]\s*(?P<rest>.*)$",
            re.IGNORECASE,
        )
        for index, chunk in enumerate(chunks):
            match = without_unit if index == 0 else continuation_pattern.match(chunk)
            if match is None:
                return raw_name, [], ["linha sem unidade nao reconhecida"]
            load = Decimal(match.group("load").replace(",", "."))
            reps, rep_reasons = _expand_repetitions(match.group("rest"))
            reasons.extend(rep_reasons)
            if not reps:
                if not rep_reasons:
                    reasons.append("repeticoes ausentes ou invalidas")
                return raw_name, [], reasons
            parsed_without_unit.extend(SetPayload(weight_kg=load, reps=rep) for rep in reps)
        return raw_name, parsed_without_unit, reasons

    raw_name = cleaned[: load_matches[0].start()].replace("-", " ").strip(" -:")
    if not raw_name:
        reasons.append("exercicio sem nome")
        raw_name = "Exercicio sem nome"

    parsed_sets: list[SetPayload] = []
    for index, load_match in enumerate(load_matches):
        segment_end = load_matches[index + 1].start() if index + 1 < len(load_matches) else len(cleaned)
        segment = cleaned[load_match.end() : segment_end]
        parsed_load = parse_load(load_match.group("load"), load_match.group("unit"))
        reasons.extend(parsed_load.reasons)
        if parsed_load.weight_kg is None or parsed_load.weight_kg < 0:
            continue
        load = parsed_load.weight_kg
        reps, rep_reasons = _expand_repetitions(segment)
        reasons.extend(rep_reasons)
        if not reps:
            reasons.append(f"repeticoes ausentes para {load:g} kg")
            continue
        parsed_sets.extend(SetPayload(weight_kg=load, reps=rep) for rep in reps)
    return raw_name, parsed_sets, reasons


def parse_workout_message(message: WhatsAppMessage) -> ParseOutcome:
    if message.is_deleted or message.is_media or not message.sender_raw:
        return ParseOutcome()

    workout_type, lines = prepare_training_lines(message.raw_content)
    exercises: list[ExercisePayload] = []
    reasons: list[str] = []
    consumed: list[str] = []
    notes: list[str] = []

    for line in lines:
        notes.extend(re.findall(r"\(([^)]*)\)", line))
        raw_name, sets, line_reasons = parse_set_line(line)
        if not raw_name and not sets and not line_reasons:
            consumed.append(line)
            continue
        if not sets:
            reasons.extend(f"{reason}: {line}" for reason in line_reasons)
            continue

        reasons.extend(f"{reason}: {line}" for reason in line_reasons)
        uncertain_fields = []
        if any("repeticoes" in reason for reason in line_reasons):
            uncertain_fields.append("reps")
        if any("carga" in reason or "unidade" in reason for reason in line_reasons):
            uncertain_fields.append("weight_kg")
        match = resolve_static_exercise(raw_name, workout_type)
        if match is None:
            reasons.append(f"exercicio desconhecido: {raw_name}")
            exercises.append(
                ExercisePayload(
                    raw_name=raw_name,
                    sets=sets,
                    uncertain_fields=[*uncertain_fields, "canonical_name", "muscle_group", "equipment"],
                    needs_review=True,
                )
            )
            consumed.append(line)
            continue

        if match.equipment is None:
            uncertain_fields.append("equipment")
            reasons.append(f"equipamento nao determinado: {raw_name}: {line}")
        exercises.append(
            ExercisePayload(
                raw_name=raw_name,
                canonical_name=match.canonical_name,
                muscle_group=match.muscle_group,
                equipment=match.equipment,
                load_basis=match.load_basis,
                sets=sets,
                uncertain_fields=uncertain_fields,
                needs_review=bool(uncertain_fields or line_reasons),
            )
        )
        consumed.append(line)

    if not exercises and not reasons:
        return ParseOutcome()

    extraction = WorkoutExtraction(
        workout_date=message.sent_at.date(),
        workout_type=workout_type,
        notes="; ".join(notes) or None,
        exercises=exercises,
        unconsumed_text=[line for line in lines if line not in consumed],
        needs_review=bool(reasons),
    )
    if extraction.unconsumed_text:
        reasons.append("parte relevante da mensagem nao consumida")
    return ParseOutcome(extraction=extraction, reasons=reasons, consumed_lines=consumed)


def normalized_set_signatures(outcome: ParseOutcome) -> set[tuple[str, str, str, str]]:
    if not outcome.extraction:
        return set()
    signatures = set()
    for exercise in outcome.extraction.exercises:
        for item in exercise.sets:
            signatures.add(
                (
                    exercise.canonical_name or normalize_text(exercise.raw_name),
                    normalize_equipment(exercise.equipment),
                    str(item.weight_kg.normalize()),
                    str(item.reps),
                )
            )
    return signatures
