export type UIContext={page:string;component:string;field:string;confidence:'source'|'component';};
export function pageKind(path:string){
 if(/^\/settings(?:\/|$)/.test(path))return 'settings';if(!path.startsWith('/creator'))return 'global';
 for(const [match,name]of [['/commissions/services','services'],['/commissions/workflows','workflows'],['/commissions/forms','forms'],['/commissions/policies','policies'],['/portfolio','portfolio'],['/commissions','commissions'],['/orders','orders'],['/products','products'],['/bundles','products'],['/wallet','wallet'],['/quests','quests'],['/tasks','quests'],['/discounts','discounts']])if(path.includes(match))return name;return 'dashboard';
}
export const excludedUI=[
 'script','style','noscript','code','pre','[data-nya]','[data-vgen-nya-ui]','[data-nya-i18n]','[contenteditable]','[data-user-content]',
 '.str-chat__message','.str-chat__message-text','.str-chat__message-bubble','.reviewText','.privateNoteText','.userDetails','.projectName','.tagsList','.tag','.selectedTag',
 '.showcaseTitle','.serviceTitle','.serviceName','.portfolioTitle','.productTitle','.bundleTitle','.displayName','.username','.userBio','.folderName','.formName','.workflowName','.policyName','[class*="CategoryHeadingContents"] .heading',
 '[class*="Username"]','[class*="UserName"]','[class*="DisplayName"]','[class*="UserBio"]','[class*="Avatar"]','[class*="UserDetails"]','[class*="TagSearch"]','[class*="TagChip"]','[class*="Tag__"]',
 '[class*="ShowcaseCard"]','[class*="ShowcaseTile"]','[class*="PortfolioCard"]','[class*="ShowcaseTitle"]','[class*="ServiceTitle"]','[class*="ServiceCard"]','[class*="ProductCard"]','[class*="ProductTitle"]','[class*="BundleCard"]',
 '.commissionCard','[class*="CommissionCard"]','[class*="ProjectName"]','[class*="FormFieldValue"]','[class*="RequestDetails"]','[data-customer-content]','.filterMenuLink','.selectedFilterPill','[class*="CustomTag"]','[class*="FormName"]','[class*="WorkflowName"]','[class*="PolicyName"]','[class*="ServiceName"]','[class*="BundleTitle"]',
].join(',');
const islands='[class*="CardActionMenu"],[class*="CardOptionsMenu"],[class*="CommissionStatusBadge"],.checkableClientTags,[data-vgen-ui-island]';
const structural=/(?:Navbar|NavBar|Sidebar|PageHeader|PageTitle|HeaderActions|Header__|Dropdown|Menu__|MenuItem|Tooltip|Alert|Toast|SearchBar|Pagination|StatusBadge|EmptyState|ShowcaseOptionsForm|CommissionBoardPhase|CommissionBoard__|FieldLabel|OptionDescriptionGroup|RadioButton|TextToggle|Accordion|VerificationQuest|DiscoveryQuest|ShopQuestsTeaser|Task__|MediaSelector|Select__)/;
const generic=/^(?:Text|Button|InputField|Icon|Badge|Flex|Grid|Box|ModalBase)$/;
export function componentName(element:Element){for(let e=element,n=0;e&&n<9;e=e.parentElement,n++){const explicit=e.getAttribute('data-vgen-ui-component');if(explicit&&/^[A-Za-z][\w-]{1,60}$/.test(explicit))return explicit;for(const cls of e.classList){const match=cls.match(/^([A-Za-z][A-Za-z0-9_]*)__[^ ]+/);if(match&&!generic.test(match[1]))return match[1]}}return element.tagName.toLowerCase()}
export function classifyUI(element:Element,sourceApproved:boolean,field='text'):UIContext|null{
 const own=element.closest('[data-nya],[data-vgen-nya-ui],[data-nya-i18n],script,style,code,pre');if(own)return null;
 const island=element.closest(islands);if(element.closest(excludedUI)&&!island)return null;
 if(field==='text'&&element.closest('input,textarea,[contenteditable]'))return null;
 if(field!=='text'&&element.closest('[contenteditable],.str-chat__message,.reviewText'))return null;
 const page=pageKind(element.ownerDocument?.location?.pathname||'/');let component=componentName(element);
 const modal=element.closest('[class*="ShowcaseModal"],[class*="CommissionModal"],[class*="ReviewModal"],.str-chat');
 let contextPage=modal?.className&&String(modal.className).includes('ShowcaseModal')?'showcase':modal?.className&&String(modal.className).includes('ReviewModal')?'review':element.closest('.str-chat')?'messages':page;
 const semantic=element.closest('button,[role="button"],[role="menuitem"],label,legend,h1,h2,h3,h4,h5,th,[role="columnheader"],[role="tab"],[role="option"],[role="tooltip"]');
 const navigation=element.closest('nav,header,aside,[class*="Navbar"],[class*="Sidebar"]');
 const explicit=element.closest('[data-vgen-ui-component],[data-nya-native-ui]');
 const uiRegion=structural.test(component)||!!navigation||element.matches('.publishedDate,.sectionHeading,.sectionSubtitle,.separateSectionHeading,.separateSectionSubtitle');
 // These quest titles/descriptions are authored by VGen's fixed quest components.
 // Progress values live in separate elements; never collect the whole quest card.
 const nativeContract=contextPage==='quests'&&/^(Task|Accordion|VerificationQuest|DiscoveryQuest|ShopDiscoveryQuest|ShopQuestsTeaser)$/.test(component)&&!!element.closest('.title,.description,.subtitle')&&!element.closest('.progress,.progressText,.amount,.value,[class*="Progress"]');
 // Unknown text needs a confirmed native UI island, not merely English characters.
 if(!sourceApproved&&!explicit&&!nativeContract)return null;
 if(!semantic&&!navigation&&!island&&!uiRegion&&!explicit&&!nativeContract)return null;
 if(semantic?.matches('label')&&!sourceApproved&&!explicit)return null;
 if(field!=='text'&&!element.matches('input,textarea,button,a,[role="button"],[role="menuitem"]'))return null;
 return {page:contextPage,component,field,confidence:sourceApproved?'source':'component'};
}
