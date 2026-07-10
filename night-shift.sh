#!/bin/zsh
# Ночная смена хакатона: захват сырья + авто-минтер + не даёт Маку заснуть.
# Запуск ИЗ СВОЕГО ТЕРМИНАЛА (не из Claude — песочница убивает фон после сессии):
#   cd ~/Documents/Coding/hackathon && ./night-shift.sh
# Остановка: Ctrl+C (убьёт всё разом). Логи: day1/capture.log, mint/minter.log.
# Мак: подключи питание; крышку не закрывать (или закрывать только с внешним монитором).
cd "$(dirname "$0")"
trap 'echo; echo "[night-shift] стоп"; kill 0' INT TERM
node day1/save-fixture-ids.mjs   # страховка: id всех будущих матчей — до того, как они исчезнут
node day1/capture.mjs >> day1/capture.log 2>&1 &
node mint/minter.mjs >> mint/minter.log 2>&1 &
node gallery/publish.mjs >> gallery/publish.log 2>&1 &
echo "[night-shift] захват + минтер + live-паблишер запущены"
echo "[night-shift] держу Мак бодрым (caffeinate)… Ctrl+C для остановки"
caffeinate -is
