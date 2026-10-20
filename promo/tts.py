"""홍보 영상 대본을 AI 목소리(마이크로소프트 엣지 읽어주기 음성, edge-tts)로 읽어 줄마다 mp3로 저장한다.
단어마다 언제 읽는지(NN.words.json)도 함께 저장해, 자막을 말하는 단어에 맞춰 띄울 수 있게 한다.

GitHub Actions의 Promo TTS 작업에서 실행한다(작업 공간에서는 바깥 인터넷이 막혀 있음).
사용: python promo/tts.py promo/stories/s1-maker.json 출력폴더 [목소리] [빠르기]
"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts


async def speak(text: str, voice: str, rate: str, path: Path) -> list:
    try:
        com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:  # 단어 시각을 지원하지 않는 버전
        com = edge_tts.Communicate(text, voice, rate=rate)
    words = []
    with path.open("wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offset·duration 단위는 100나노초
                words.append({"text": chunk["text"], "start": chunk["offset"] / 1e7, "dur": chunk["duration"] / 1e7})
    return words


async def main() -> None:
    story = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    voice = (sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None) or story.get("voice", "ko-KR-SunHiNeural")
    rate = (sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None) or story.get("rate", "+0%")
    for line in story["lines"]:
        path = out / f"{line['id']}.mp3"
        words = await speak(line["say"], voice, rate, path)
        (out / f"{line['id']}.words.json").write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
        print(f"{line['id']} {path.stat().st_size} bytes, 단어 {len(words)}개")
    (out / "manifest.json").write_text(
        json.dumps({"story": story["id"], "voice": voice, "rate": rate, "lines": [l["id"] for l in story["lines"]]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


asyncio.run(main())
