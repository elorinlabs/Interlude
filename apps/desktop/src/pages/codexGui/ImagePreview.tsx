import { displayText } from '../../i18n/uiText';
import { useContext } from 'react';
import { ImageViewer } from "../../../../../shared/chat/ImageViewer";
import { FileEnvironmentContext } from './fileEnvironment';
import { useImageMenu } from "./useImageMenu";
import styles from "./ImagePreview.module.less";

interface Props {
  thumbnail: string;
  description: string;
  load: () => Promise<string>;
  close: () => void;
  prepare?: (url: string) => Promise<string>;
  download?: (url: string) => void | Promise<void>;
}

export function ImagePreview(props: Props) {
  const menu = useImageMenu(props.prepare);
  const environment = useContext(FileEnvironmentContext);
  return <span className={styles.preview}><ImageViewer {...props} {...menu}
    autoLoadOriginal={!environment?.remote} translate={displayText} /></span>;
}
