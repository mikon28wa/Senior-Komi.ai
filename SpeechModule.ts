
export enum SpeechStatus {
  IDLE = 'idle',
  LISTENING = 'listening',
  PROCESSING = 'processing',
  SPEAKING = 'speaking'
}

export interface SpeechModuleOptions {
  language?: string;
}

export class SpeechModule {
  private recognition: any;
  private synth = window.speechSynthesis;
  private _status: SpeechStatus = SpeechStatus.IDLE;
  private language: string;

  private onTextCallback: ((text: string) => void) | null = null;
  private onStatusChangeCallback: ((status: SpeechStatus) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  constructor(options: SpeechModuleOptions = {}) {
    this.language = options.language || 'de-DE';
    this.initRecognition();
  }

  private initRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.lang = this.language;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.setStatus(SpeechStatus.LISTENING);
    };

    this.recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      if (this.onTextCallback) this.onTextCallback(text);
    };

    this.recognition.onerror = (event: any) => {
      this.setStatus(SpeechStatus.IDLE);
      if (this.onErrorCallback) this.onErrorCallback(event.error);
    };

    this.recognition.onend = () => {
      this.setStatus(SpeechStatus.IDLE);
    };
  }

  public setLanguage(lang: string) {
    this.language = lang;
    if (this.recognition) this.recognition.lang = lang;
  }

  public async startListening(): Promise<void> {
    if (this.status !== SpeechStatus.IDLE) return;
    try {
      this.recognition.start();
    } catch (e) {
      console.error('Error starting recognition:', e);
    }
  }

  public stopListening(): void {
    if (this.recognition) this.recognition.stop();
  }

  public speak(text: string): void {
    if (!this.synth) return;
    
    // Stop any current speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => this.setStatus(SpeechStatus.SPEAKING);
    utterance.onend = () => this.setStatus(SpeechStatus.IDLE);
    
    this.synth.speak(utterance);
  }

  public onText(cb: (text: string) => void) {
    this.onTextCallback = cb;
  }

  public onStatusChange(cb: (status: SpeechStatus) => void) {
    this.onStatusChangeCallback = cb;
  }

  public onError(cb: (error: string) => void) {
    this.onErrorCallback = cb;
  }

  public get status(): SpeechStatus {
    return this._status;
  }

  public setStatus(status: SpeechStatus) {
    this._status = status;
    if (this.onStatusChangeCallback) this.onStatusChangeCallback(status);
  }

  public destroy() {
    this.stopListening();
    if (this.synth) this.synth.cancel();
    this.onTextCallback = null;
    this.onStatusChangeCallback = null;
    this.onErrorCallback = null;
  }
}
