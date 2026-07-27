import { ARENA_NAME, TeamId } from '@splat04/shared';

export interface HighlightData {
  name: string;
  team: TeamId;
  coverage: number;
  tags: number;
  won: boolean;
  challengeUrl: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * Renders a deliberately tacky vertical 9:16 result card onto a canvas.
 * A share image, not a video pipeline — no encoding, no workers, no dependencies.
 */
export function drawHighlightCard(canvas: HTMLCanvasElement, data: HighlightData): void {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const teamColour = data.team === TeamId.Cyan ? '#12e2f0' : '#ff2fa4';
  const teamName = data.team === TeamId.Cyan ? 'CYAN' : 'MAGENTA';

  // Sunset backdrop.
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#2a3f7a');
  sky.addColorStop(0.42, '#ff8f6b');
  sky.addColorStop(0.62, '#ffd7a8');
  sky.addColorStop(1, '#0d1730');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Splattered paint blobs in the team colour.
  ctx.globalAlpha = 0.75;
  let seed = 20040;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : teamColour;
    const cx = rand() * WIDTH;
    const cy = 620 + rand() * 900;
    const r = 20 + rand() * 120;
    ctx.beginPath();
    for (let a = 0; a < 14; a++) {
      const angle = (a / 14) * Math.PI * 2;
      const wobble = r * (0.7 + rand() * 0.6);
      const px = cx + Math.cos(angle) * wobble;
      const py = cy + Math.sin(angle) * wobble;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Scanlines.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < HEIGHT; y += 6) ctx.fillRect(0, y, WIDTH, 2);

  // Broadcast frame.
  ctx.strokeStyle = '#0a1220';
  ctx.lineWidth = 26;
  ctx.strokeRect(13, 13, WIDTH - 26, HEIGHT - 26);
  ctx.strokeStyle = teamColour;
  ctx.lineWidth = 8;
  ctx.strokeRect(44, 44, WIDTH - 88, HEIGHT - 88);

  const centre = WIDTH / 2;
  ctx.textAlign = 'center';

  panel(ctx, 90, 150, WIDTH - 180, 210);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 130px "Arial Black", Impact, sans-serif';
  ctx.fillText('SPLAT 04', centre, 285);
  ctx.fillStyle = '#c8ff2f';
  ctx.font = 'bold 40px "Trebuchet MS", sans-serif';
  ctx.fillText(ARENA_NAME, centre, 340);

  // Verdict.
  ctx.fillStyle = data.won ? '#c8ff2f' : '#ffffff';
  ctx.font = 'italic 900 150px "Arial Black", Impact, sans-serif';
  ctx.fillText(data.won ? 'WINNER' : 'COOKED', centre, 700);

  // Player identity.
  panel(ctx, 90, 780, WIDTH - 180, 190);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 84px "Arial Black", Impact, sans-serif';
  ctx.fillText(truncate(data.name, 16), centre, 880);
  ctx.fillStyle = teamColour;
  ctx.font = 'bold 46px "Trebuchet MS", sans-serif';
  ctx.fillText(`TEAM ${teamName}`, centre, 940);

  // Headline stats.
  statBlock(ctx, centre - 250, 1060, 'FINAL COVERAGE', `${data.coverage.toFixed(0)}%`, teamColour);
  statBlock(ctx, centre + 250, 1060, 'TAGS', `${data.tags}`, '#c8ff2f');

  // Fake sponsor strip.
  ctx.fillStyle = 'rgba(6,10,20,0.8)';
  ctx.fillRect(90, 1360, WIDTH - 180, 110);
  ctx.fillStyle = '#c8ff2f';
  ctx.font = 'bold 40px "Trebuchet MS", sans-serif';
  ctx.fillText('SLIMEWIRE · VOLT JUICE · TURBO TAN', centre, 1430);

  // Challenge call to action.
  panel(ctx, 90, 1530, WIDTH - 180, 250);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 62px "Arial Black", Impact, sans-serif';
  ctx.fillText('BEAT THIS SCORE', centre, 1620);
  ctx.fillStyle = '#12e2f0';
  ctx.font = '38px "Trebuchet MS", sans-serif';
  wrapText(ctx, data.challengeUrl, centre, 1690, WIDTH - 240, 46);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 30px "Trebuchet MS", sans-serif';
  ctx.fillText('CLICK. SPLAT. WIN. STAY IF YOU WANT.', centre, 1850);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(6,10,20,0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#b9c4d2';
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);
}

function statBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  label: string,
  value: string,
  colour: string,
): void {
  panel(ctx, cx - 210, y, 420, 220);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.fillText(label, cx, y + 62);
  ctx.fillStyle = colour;
  ctx.font = 'italic 900 110px "Arial Black", Impact, sans-serif';
  ctx.fillText(value, cx, y + 170);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  // URLs have no spaces, so wrap on character count rather than words.
  let line = '';
  let offsetY = y;
  for (const char of text) {
    const candidate = line + char;
    if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, offsetY);
      line = char;
      offsetY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, offsetY);
}

/** Best-effort PNG download; browsers without `toBlob` simply get no file. */
export function downloadCard(canvas: HTMLCanvasElement, filename: string): boolean {
  if (typeof canvas.toBlob !== 'function') return false;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and permission; fall back to selection.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
