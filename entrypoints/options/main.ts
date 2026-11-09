import {CLIENT_REVIEW_TAGS} from '../../src/review-tags';
import {mount,settings,rpc,el,editor} from '../../src/ui';
const cfg=await rpc('load');const {root}=mount(document.body);await settings(root,cfg,()=>{});const sample=el('section','',root);sample.className='panel';el('h2','安全模拟编辑器',sample);const input=el('textarea','感谢您的委托，我预计下周开始制作。',sample);input.value=input.textContent;editor(sample,cfg,'chat',()=>input.value,async value=>{input.value=value});
const review=el('section','',root);review.className='panel';el('h2','安全模拟评价区',review);const reviewInput=el('textarea','',review);editor(review,cfg,'review',()=>reviewInput.value,async value=>{reviewInput.value=value},{nativeTags:CLIENT_REVIEW_TAGS});
