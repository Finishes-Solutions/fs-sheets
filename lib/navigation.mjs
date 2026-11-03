// Navigation must keep workspace context and sheet selection consistent.
const pages=new Set(['home','sheet','reports','dashboards','forms','automations','activity','testing','portfolios','scenarios','dataTables','dynamicViews']);
const views=new Set(['Table','Board','Calendar','Gantt','Timeline','Dashboard']);
export function preferredWorkspaceId(state){
 const ranked=state.workspaces.map((w,i)=>({id:w.id,index:i,imports:state.sheets.filter(s=>s.workspaceId===w.id&&s.source?.file).length}));
 ranked.sort((a,b)=>b.imports-a.imports||a.index-b.index);return ranked[0]?.id;
}
export function resolveLocation(state,saved={}){
 saved=saved&&typeof saved==='object'?saved:{};
 const savedSheet=state.sheets.find(s=>s.id===saved.sheetId),validWorkspace=state.workspaces.some(w=>w.id===saved.workspaceId),workspaceId=validWorkspace?saved.workspaceId:savedSheet?.workspaceId||preferredWorkspaceId(state),sheetId=savedSheet?.workspaceId===workspaceId?savedSheet.id:state.sheets.find(s=>s.workspaceId===workspaceId)?.id;
 let page=pages.has(saved.page)?saved.page:'home';if(page==='sheet'&&!sheetId)page='home';
 return {workspaceId,sheetId,page,view:views.has(saved.view)?saved.view:'Table',reportId:typeof saved.reportId==='string'?saved.reportId:'all-work',dashboardId:typeof saved.dashboardId==='string'?saved.dashboardId:'workspace-overview'};
}
