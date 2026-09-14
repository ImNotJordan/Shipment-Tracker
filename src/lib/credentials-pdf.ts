import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out}#1`;
}

export async function credentialsPdf(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  companyName: string;
  signInUrl: string;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.CourierBold);
  const ink = rgb(0.063, 0.094, 0.102);
  const ivory = rgb(0.937, 0.941, 0.941);
  const dim = rgb(0.75, 0.757, 0.757);
  const amber = rgb(0.89, 0.702, 0.255);

  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: ink });
  page.drawRectangle({ x: 36, y: 36, width: 540, height: 720, color: rgb(0.04, 0.047, 0.059) });
  page.drawRectangle({ x: 36, y: 720, width: 540, height: 4, color: amber });

  page.drawText("LIVE BOARD", {
    x: 60,
    y: 680,
    size: 22,
    font: bold,
    color: ivory,
  });
  page.drawText("ACCESS CREDENTIALS", {
    x: 60,
    y: 656,
    size: 11,
    font,
    color: dim,
  });

  const lines = [
    ["NAME", input.name || "—"],
    ["EMAIL", input.email],
    ["TEMPORARY PASSWORD", input.password],
    ["ROLE", input.role.toUpperCase()],
    ["COMPANY", input.companyName],
    ["SIGN IN", input.signInUrl],
  ];

  let y = 590;
  for (const [label, value] of lines) {
    page.drawText(label, { x: 60, y, size: 9, font, color: dim });
    page.drawText(value, { x: 60, y: y - 18, size: 12, font: bold, color: ivory });
    y -= 64;
  }

  page.drawText("After first sign-in you must set a new password before the board opens.", {
    x: 60,
    y: 84,
    size: 8,
    font,
    color: dim,
  });
  page.drawText("Do not forward this sheet.", {
    x: 60,
    y: 68,
    size: 8,
    font,
    color: dim,
  });

  return pdf.save();
}
