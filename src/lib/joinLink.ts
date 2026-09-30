import { formatCode } from "../components/CodeInput";

// The address that opens the join page with the code filled in, for a link or a QR code
export function joinLink(code: string) {
    return `${window.location.origin}${window.location.pathname}#/join?code=${formatCode(code)}`;
}
