import "./index.css";
import { Composition, Folder } from "remotion";
import { AdVideo } from "./AdVideo";
import { Cta } from "./scenes/Cta";
import { Games } from "./scenes/Games";
import { Hook } from "./scenes/Hook";
import { Steps } from "./scenes/Steps";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="AdVideo-Scenes">
        <Composition id="Hook" component={Hook} width={1920} height={1080} fps={30} durationInFrames={90} />
        <Composition id="Games" component={Games} width={1920} height={1080} fps={30} durationInFrames={150} />
        <Composition id="Steps" component={Steps} width={1920} height={1080} fps={30} durationInFrames={150} />
        <Composition id="CTA" component={Cta} width={1920} height={1080} fps={30} durationInFrames={120} />
      </Folder>
      <Composition id="AdVideo" component={AdVideo} width={1920} height={1080} fps={30} durationInFrames={465} />
    </>
  );
};
