import { useMemo } from "react";
import qrcode from "qrcode-generator";

// A QR code for `text`, always dark on white (phones read that best), drawn as one SVG path
export default function QrCode({ text, size, label }: { text: string; size: number; label: string }) {
    const { count, path } = useMemo(() => {
        const qr = qrcode(0, "M");
        qr.addData(text);
        qr.make();
        const count = qr.getModuleCount();
        let path = "";
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(row, col)) path += `M${col},${row}h1v1h-1z`;
            }
        }
        return { count, path };
    }, [text]);

    // A quiet zone of 2 modules around it
    return (
        <svg className="qr-code" width={size} height={size} viewBox={`-2 -2 ${count + 4} ${count + 4}`} role="img" aria-label={label}
             shapeRendering="crispEdges">
            <rect x={-2} y={-2} width={count + 4} height={count + 4} fill="#FFFFFF"/>
            <path d={path} fill="#0F172A"/>
        </svg>
    );
}
