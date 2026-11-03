declare module 'zmodem.js' {
  export interface Details { name: string; size?: number; mtime?: Date; files_remaining?: number }
  export interface Offer {
    get_details(): Details;
    accept(options: { on_input: (bytes: number[]) => void }): Promise<void>;
    skip(): Promise<void>;
  }
  export interface Transfer { send(bytes: Uint8Array): void; end(bytes?: Uint8Array): Promise<void> }
  export interface Session {
    type: 'send' | 'receive';
    on(event: 'session_end', callback: () => void): void;
    on(event: 'offer', callback: (offer: Offer) => void): void;
    start(): void;
    abort(): void;
    has_ended(): boolean;
    aborted(): boolean;
    send_offer(details: Details): Promise<Transfer | undefined>;
    close(): Promise<void>;
  }
  export interface Detection {
    confirm(): Session;
    deny(): void;
    is_valid(): boolean;
    get_session_role(): 'send' | 'receive';
  }
  export class Sentry {
    constructor(options: {
      to_terminal: (bytes: number[]) => void;
      sender: (bytes: number[]) => void;
      on_detect: (detection: Detection) => void;
      on_retract: () => void;
    });
    consume(bytes: number[]): void;
  }
  export interface Header {
    NAME: string; get_offset(): number; to_hex(): number[];
    to_binary16(encoder: ZDLE): number[]; to_binary32(encoder: ZDLE): number[];
  }
  export interface Subpacket {
    get_payload(): number[]; frame_end(): boolean; ack_expected(): boolean;
    encode16(encoder: ZDLE): number[]; encode32(encoder: ZDLE): number[];
  }
  export interface ZDLE { set_escape_ctrl_chars(value: boolean): void }
  const Zmodem: { Sentry: typeof Sentry;
    Header: {
      build(name: string, ...args: (number | number[] | string[])[]): Header;
      trim_leading_garbage(bytes: number[]): number[];
      parse(bytes: number[]): [Header, 16 | 32] | undefined;
    };
    Subpacket: {
      parse16(bytes: number[]): Subpacket | undefined; parse32(bytes: number[]): Subpacket | undefined;
      build(bytes: number[], end: string): Subpacket;
    };
    ZDLE: new () => ZDLE;
    Text: { Decoder: new () => { decode(bytes: Uint8Array): string } };
  };
  export default Zmodem;
}
