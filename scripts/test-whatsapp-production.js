import 'dotenv/config';
import {productionConfigReport} from '../src/config.js';
import {sendWhatsAppTemplate} from '../src/notifications.js';

if(process.env.NODE_ENV!=='production')throw new Error('NODE_ENV debe ser production');
if(process.env.CONFIRM_WHATSAPP_TEST!=='YES')throw new Error('Falta CONFIRM_WHATSAPP_TEST=YES');

const report=productionConfigReport(process.env,{strictIntegrations:true});
if(report.errors.length)throw new Error('Configuración productiva incompleta: '+report.errors.join('; '));

const phone=String(process.env.WHATSAPP_TEST_PHONE||'').replace(/\D/g,'');
if(phone.length<8||phone.length>15)throw new Error('WHATSAPP_TEST_PHONE inválido');

await sendWhatsAppTemplate(phone,{
  body:'Prueba operativa de LA RED Tenis. Si recibiste este mensaje, las notificaciones de WhatsApp están configuradas correctamente.'
});

console.log(JSON.stringify({ok:true,channel:'whatsapp',sent:true}));
