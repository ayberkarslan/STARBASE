import type { ReactNode, ComponentPropsWithoutRef, ElementType, Ref } from 'react';

export type YRT_ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'bare' | 'danger';
export type YRT_ButtonSize = 'sm' | 'md';
export type YRT_StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface YRT_ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: YRT_ButtonVariant;
  size?: YRT_ButtonSize;
  loading?: boolean;
}
export function YRT_Button(props: YRT_ButtonProps & { ref?: Ref<HTMLButtonElement> }): ReactNode;
export function YRT_IconButton(props: YRT_ButtonProps & { label: string; ref?: Ref<HTMLButtonElement> }): ReactNode;
export function YRT_ChoiceCard(props: ComponentPropsWithoutRef<'button'> & { ref?: Ref<HTMLButtonElement> }): ReactNode;
export function YRT_BackArrow(props: { onClick?: () => void; label?: string; title?: string; className?: string }): ReactNode;

export interface YRT_PanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: ElementType;
}
export function YRT_Panel(props: YRT_PanelProps): ReactNode;
export function YRT_StatusBadge(props: ComponentPropsWithoutRef<'span'> & { tone?: YRT_StatusTone }): ReactNode;
export function YRT_Disclosure(props: Omit<ComponentPropsWithoutRef<'details'>, 'title'> & { title: ReactNode }): ReactNode;
export function YRT_Showcase(props: ComponentPropsWithoutRef<'figure'> & { src: string; alt: string }): ReactNode;
export function YRT_TextField(props: ComponentPropsWithoutRef<'input'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}): ReactNode;

export interface YRT_SelectOption { value: string; label: ReactNode; searchText?: string }
export interface YRT_SelectMenuProps {
  value: string;
  options: YRT_SelectOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}
export function YRT_SelectMenu(props: YRT_SelectMenuProps): ReactNode;

export function YRT_TextArea(props: ComponentPropsWithoutRef<'textarea'> & {
  label?: ReactNode; hint?: ReactNode; error?: ReactNode; ref?: Ref<HTMLTextAreaElement>;
}): ReactNode;
export function YRT_Checkbox(props: Omit<ComponentPropsWithoutRef<'input'>, 'type'> & {
  label: ReactNode; hint?: ReactNode; ref?: Ref<HTMLInputElement>;
}): ReactNode;
export function YRT_EmptyState(props: ComponentPropsWithoutRef<'div'> & {
  title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode;
}): ReactNode;
export interface YRT_TabItem { value: string; label: ReactNode; content: ReactNode; disabled?: boolean }
export function YRT_Tabs(props: {
  items: YRT_TabItem[]; value?: string; defaultValue?: string;
  onChange?: (value: string) => void; label?: string; className?: string;
}): ReactNode;
export function YRT_Dialog(props: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode;
  children?: ReactNode; actions?: ReactNode; className?: string; closeLabel?: string;
}): ReactNode;
export function YRT_Drawer(props: {
  open: boolean; onClose: () => void; title: ReactNode; eyebrow?: ReactNode;
  description?: ReactNode; children?: ReactNode; className?: string; closeLabel?: string;
}): ReactNode;
export function YRT_Stepper(props: {
  items: { value: string; label: ReactNode }[]; current: string; label?: string; className?: string;
}): ReactNode;

export { YRT_Button as Button, YRT_IconButton as IconButton, YRT_ChoiceCard as ChoiceCard,
  YRT_BackArrow as BackArrow, YRT_Panel as Panel, YRT_StatusBadge as StatusBadge,
  YRT_TextField as TextField, YRT_SelectMenu as SelectMenu,
  YRT_Disclosure as Disclosure, YRT_Showcase as Showcase,
  YRT_TextArea as TextArea, YRT_Checkbox as Checkbox,
  YRT_EmptyState as EmptyState, YRT_Tabs as Tabs, YRT_Dialog as Dialog, YRT_Drawer as Drawer,
  YRT_Stepper as Stepper };
export type { YRT_ButtonVariant as ButtonVariant, YRT_ButtonSize as ButtonSize,
  YRT_StatusTone as StatusTone, YRT_ButtonProps as ButtonProps,
  YRT_PanelProps as PanelProps, YRT_SelectOption as SelectOption,
  YRT_SelectMenuProps as SelectMenuProps };
export {default as ResizableSplit,type ResizableSplitProps} from './layout/ResizableSplit';
export {panelSizes} from './layout/panelSizes';
export {NumberInput} from './fields/NumberInput';
export {useCanvasNavigation,type CanvasFrame} from './hooks/useCanvasNavigation';
export {default as LinePlot,type PlotSeries} from './data/Plot';
export {default as NumericSeriesEditor} from './data/NumericSeriesEditor';
export {parseNumericRows,parseSeriesCsv,type NumericColumn,type NumericRow} from './data/numericSeries';
export {formatNumber,downloadFile} from './data/utils';
export {Panel as WorkspacePanel,Metric,NumberField,Choice,Empty as WorkspaceEmpty} from './patterns/workspace';
export {MenuBar,DesktopHeader,DesktopShell,TabBar,Breadcrumbs,SaveIndicator,type MenuAction,type MenuDefinition,type TabOption} from './navigation/navigation';
export {Icon,Toolbar,SearchField,FieldGrid,PropertySection,ScrollArea,ListItem,SelectionChips,ZoomControls,CatalogCard,CatalogLayout,DataTable} from './patterns/controls';
export {Toast,Tooltip,OrbitLoader} from './feedback/feedback';
export {CanvasViewport,NodeCard,NodeGraph,TreeView,HierarchyFlow,type GraphItem,type GraphLink} from './patterns/canvas';
export {hierarchyPositions,validateHierarchyMove,type HierarchyEntry,type HierarchyMove,type MovePlacement} from './patterns/hierarchy';
export {default as StartupScreen} from './feedback/StartupScreen';
export {waitForStartup} from './feedback/startupTiming';
export {RangeField,Switch} from './fields/RangeField';
export {IdlePresentation,type IdlePresentationProps} from './feedback/IdlePresentation';
