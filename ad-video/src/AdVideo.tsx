import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Cta } from "./scenes/Cta";
import { Games } from "./scenes/Games";
import { Hook } from "./scenes/Hook";
import { Steps } from "./scenes/Steps";

// 90 + 150 + 150 + 120 - 3 × 15 frames of transition overlap = 465 frames.
export const AdVideo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Hook" durationInFrames={90}>
      <Hook />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={slide({ direction: "from-right" })}
      timing={linearTiming({ durationInFrames: 15 })}
    />
    <TransitionSeries.Sequence name="Games" durationInFrames={150}>
      <Games />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={slide({ direction: "from-right" })}
      timing={linearTiming({ durationInFrames: 15 })}
    />
    <TransitionSeries.Sequence name="Steps" durationInFrames={150}>
      <Steps />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 15 })}
    />
    <TransitionSeries.Sequence name="CTA" durationInFrames={120}>
      <Cta />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
