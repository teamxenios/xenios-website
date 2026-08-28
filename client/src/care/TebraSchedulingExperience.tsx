import { useEffect, useRef, useState } from "react";
import type {
  TebraPublicConfiguration,
  TebraSchedulingConfiguration,
} from "@shared/care/tebra-experience";
import type { TebraConfigurationLoadState } from "./useTebraPublicConfiguration";

interface Props {
  state: TebraConfigurationLoadState;
  onRetry: () => void;
}

type ReadyIframeScheduling = Extract<
  TebraSchedulingConfiguration,
  { status: "ready" }
> & { mode: "iframe" };
type ReadyPopupScheduling = Extract<
  TebraSchedulingConfiguration,
  { status: "ready"; mode: "popup_widget" }
>;

const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
  referrerPolicy: "no-referrer" as const,
};

function DirectSchedulingLink({ url, label = "Request an appointment in Tebra" }: {
  url: string;
  label?: string;
}) {
  return (
    <div>
      <a className="btn btn-primary min-h-11" href={url} {...externalLinkProps}>
        {label}
      </a>
      <p className="body-s text-ink-mute mt-3">
        Opens Tebra in a new tab. Tebra and the practice handle the information you enter there.
      </p>
    </div>
  );
}

function SchedulingUnavailable({ status }: { status: TebraSchedulingConfiguration["status"] }) {
  const copy = status === "disabled"
    ? "Online appointment requests are not enabled."
    : status === "care_unavailable"
      ? "Xenios Care is not available."
      : status === "configuration_invalid"
        ? "Online scheduling is unavailable while its configuration is reviewed."
        : "Online scheduling has not been configured.";

  return (
    <aside className="card max-w-[760px]" role="status" data-tebra-scheduling-status={status}>
      <p className="mono-label text-pulse mb-3">SCHEDULING UNAVAILABLE</p>
      <h2 className="h2">{copy}</h2>
      <p className="body-m text-ink-2 mt-4">
        No appointment has been requested or confirmed. Contact Xenios if you need help understanding
        the current Care status.
      </p>
    </aside>
  );
}

function IframeScheduling({ scheduling }: { scheduling: ReadyIframeScheduling }) {
  const [frameState, setFrameState] = useState<"waiting" | "loaded" | "slow">("waiting");
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setFrameState("waiting");
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setFrameState("slow");
    }, 12_000);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [scheduling.url]);

  return (
    <div className="grid grid-cols-1 gap-6" data-tebra-scheduling-mode="iframe">
      <aside className="card" aria-live="polite">
        <p className="mono-label text-pulse mb-3">TEBRA SCHEDULING</p>
        <p className="body-m text-ink-2">
          {frameState === "slow"
            ? "The embedded scheduler is taking longer than expected. Use the direct Tebra link below."
            : frameState === "loaded"
              ? "The Tebra frame loaded. This does not mean an appointment request was submitted or confirmed."
              : "Loading the Tebra appointment-request form. The direct link below is available now."}
        </p>
      </aside>
      <iframe
        src={scheduling.url}
        title="Tebra appointment-request form"
        className="w-full min-h-[680px] border border-ink/20 bg-white"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
        allow="camera 'none'; microphone 'none'; geolocation 'none'"
        onLoad={() => {
          if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          setFrameState("loaded");
        }}
      />
      <DirectSchedulingLink url={scheduling.url} label="Open the Tebra form in a new tab" />
    </div>
  );
}

function PopupScheduling({ scheduling }: { scheduling: ReadyPopupScheduling }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const ownedScriptRef = useRef<HTMLScriptElement | null>(null);
  const detachExistingListenersRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const [widgetState, setWidgetState] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      detachExistingListenersRef.current?.();
      detachExistingListenersRef.current = null;
      if (ownedScriptRef.current) {
        ownedScriptRef.current.onload = null;
        ownedScriptRef.current.onerror = null;
        ownedScriptRef.current.remove();
        ownedScriptRef.current = null;
      }
    };
  }, []);

  function loadWidget() {
    if (widgetState === "loading" || widgetState === "loaded" || !mountRef.current) return;
    setWidgetState("loading");

    const existing = Array.from(document.scripts).find(
      (script) => script.dataset.tebraWidgetSource === scheduling.popupScriptUrl,
    );
    if (existing) {
      if (existing.dataset.tebraWidgetState === "loaded") {
        setWidgetState("loaded");
      } else {
        setWidgetState("loading");
        let handleExistingLoad: () => void;
        let handleExistingError: () => void;
        const detach = () => {
          existing.removeEventListener("load", handleExistingLoad);
          existing.removeEventListener("error", handleExistingError);
        };
        handleExistingLoad = () => {
          if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          detach();
          detachExistingListenersRef.current = null;
          if (mountedRef.current) setWidgetState("loaded");
        };
        handleExistingError = () => {
          if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          detach();
          detachExistingListenersRef.current = null;
          if (mountedRef.current) setWidgetState("error");
        };
        existing.addEventListener("load", handleExistingLoad);
        existing.addEventListener("error", handleExistingError);
        detachExistingListenersRef.current = detach;
        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null;
          detach();
          detachExistingListenersRef.current = null;
          if (mountedRef.current) setWidgetState("error");
        }, 12_000);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = scheduling.popupScriptUrl;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.dataset.tebraWidgetSource = scheduling.popupScriptUrl;
    script.dataset.tebraWidgetState = "loading";
    ownedScriptRef.current = script;
    script.onload = () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      script.dataset.tebraWidgetState = "loaded";
      if (mountedRef.current) setWidgetState("loaded");
    };
    script.onerror = () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (ownedScriptRef.current === script) ownedScriptRef.current = null;
      if (mountedRef.current) setWidgetState("error");
    };
    mountRef.current.appendChild(script);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (ownedScriptRef.current === script) ownedScriptRef.current = null;
      if (mountedRef.current) setWidgetState("error");
    }, 12_000);
  }

  return (
    <div className="grid grid-cols-1 gap-6" data-tebra-scheduling-mode="popup_widget">
      <div ref={mountRef} className="card min-h-11" aria-live="polite">
        <p className="mono-label text-pulse mb-3">OPTIONAL TEBRA WIDGET</p>
        <p className="body-m text-ink-2">
          {widgetState === "idle" && "The Tebra widget loads only after you choose to continue."}
          {widgetState === "loading" && "Loading the Tebra widget…"}
          {widgetState === "loaded" &&
            "Tebra's widget code loaded. Continue with the Tebra control it provides; this does not confirm an appointment."}
          {widgetState === "error" &&
            "The widget could not be loaded. Use the direct Tebra link below."}
        </p>
        {widgetState === "idle" && (
          <button type="button" className="btn btn-primary min-h-11 mt-5" onClick={loadWidget}>
            Load Tebra scheduling
          </button>
        )}
      </div>
      <DirectSchedulingLink url={scheduling.url} label="Use the direct Tebra link" />
    </div>
  );
}

function ReadyScheduling({ configuration }: { configuration: TebraPublicConfiguration }) {
  const scheduling = configuration.scheduling;
  if (scheduling.status !== "ready") return <SchedulingUnavailable status={scheduling.status} />;

  return (
    <div>
      <div className="card max-w-[760px] mb-8">
        <p className="mono-label text-pulse mb-3">APPOINTMENT REQUEST</p>
        <h2 className="h2">Continue with the practice in Tebra.</h2>
        <p className="body-m text-ink-2 mt-4">
          Submitting the Tebra form sends a request for practice review. It does not guarantee an
          appointment, clinical acceptance, treatment, or a prescription. Available times and visit
          types are shown in Tebra. Your request remains pending until the practice confirms it.
        </p>
        {(scheduling.practiceName || scheduling.locationLabel || scheduling.providerLabel) && (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-6">
            {scheduling.practiceName && <div><dt className="mono-label text-ink-mute">PRACTICE</dt><dd className="body-m mt-1">{scheduling.practiceName}</dd></div>}
            {scheduling.locationLabel && <div><dt className="mono-label text-ink-mute">LOCATION</dt><dd className="body-m mt-1">{scheduling.locationLabel}</dd></div>}
            {scheduling.providerLabel && <div><dt className="mono-label text-ink-mute">PROVIDER</dt><dd className="body-m mt-1">{scheduling.providerLabel}</dd></div>}
          </dl>
        )}
        {scheduling.telehealthEnabled === true && (
          <p className="body-s text-ink-2 mt-6" data-tebra-telehealth-attested="true">
            If the practice and provider have the required online-scheduling and Telehealth
            subscriptions and configuration, Tebra may show in-office or telehealth request options.
            Availability is not guaranteed.
          </p>
        )}
      </div>

      {scheduling.mode === "iframe" && <IframeScheduling scheduling={scheduling} />}
      {scheduling.mode === "popup_widget" && (
        <PopupScheduling key={scheduling.popupScriptUrl} scheduling={scheduling} />
      )}
      {scheduling.mode === "direct_link" && (
        <div data-tebra-scheduling-mode="direct_link">
          <DirectSchedulingLink url={scheduling.url} />
        </div>
      )}
    </div>
  );
}

export default function TebraSchedulingExperience({ state, onRetry }: Props) {
  if (state.kind === "loading") {
    return (
      <aside className="card max-w-[760px]" aria-live="polite" aria-busy="true">
        <p className="mono-label text-pulse mb-3">CHECKING CONFIGURATION</p>
        <h2 className="h2">Checking whether Tebra scheduling is available…</h2>
        <p className="body-m text-ink-2 mt-4">This page will not expose a Tebra handoff until the check finishes.</p>
      </aside>
    );
  }

  if (state.kind === "error") {
    return (
      <aside className="card max-w-[760px]" role="alert">
        <p className="mono-label text-pulse mb-3">CONFIGURATION UNAVAILABLE</p>
        <h2 className="h2">Tebra scheduling could not be verified.</h2>
        <p className="body-m text-ink-2 mt-4">
          Scheduling remains unavailable. No appointment request has been made.
        </p>
        <button type="button" className="btn btn-secondary min-h-11 mt-5" onClick={onRetry}>
          Try again
        </button>
      </aside>
    );
  }

  return <ReadyScheduling configuration={state.configuration} />;
}
