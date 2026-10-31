import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DesktopShell,DesktopHeader,MenuBar,SaveIndicator,TabBar,ResizableSplit,WorkspacePanel,ScrollArea,NumberInput,FieldGrid,CanvasViewport,Button,Dialog,TextField,EmptyState} from '@stardrop/ui';
import {Plus} from '@stardrop/ui/icons';
import '@stardrop/ui/styles.css';
import './style.css';
function App(){
 const [name,setName]=useState('Yeni proje'),[tab,setTab]=useState('design'),[length,setLength]=useState<number|undefined>(),[open,setOpen]=useState(false);
 return <DesktopShell header={<DesktopHeader start={<MenuBar menus={[{label:'Dosya',items:[{label:'Yeni proje',shortcut:'Ctrl N',action:()=>setOpen(true)}]}]}/>} brand="PROJE" end={<SaveIndicator saved/>}/>} navigation={<TabBar label="Sayfalar" value={tab} onChange={setTab} items={[{value:'design',label:'Tasarım'},{value:'analysis',label:'Analiz'}]}/>}>
 <ResizableSplit axis="x" storageKey="main" label="Özellik ve canvas genişliği" initialRatio={.3} minFirst={260} minSecond={300}>
 <WorkspacePanel title={name}><ScrollArea><FieldGrid columns={1}><NumberInput label="Uzunluk" unit="mm" optional value={length} onChange={setLength}/><Button onClick={()=>setOpen(true)}><Plus size={16}/>Ekle</Button></FieldGrid></ScrollArea></WorkspacePanel>
 <WorkspacePanel title={tab==='design'?'Görünüm':'Sonuçlar'}><CanvasViewport><EmptyState title="Başlamaya hazır" icon={<Plus size={32}/>} action={<Button onClick={()=>setOpen(true)}>Ekle</Button>}/></CanvasViewport></WorkspacePanel>
 </ResizableSplit>
 <Dialog open={open} onClose={()=>setOpen(false)} title="Proje" actions={<Button onClick={()=>setOpen(false)}>Tamam</Button>}><TextField label="Proje adı" value={name} onChange={event=>setName(event.target.value)}/></Dialog>
 </DesktopShell>;
}
createRoot(document.getElementById('root')!).render(<App/>);
