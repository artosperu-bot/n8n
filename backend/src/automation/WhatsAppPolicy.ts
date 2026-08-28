export type WhatsAppWindowDecision={allowed:boolean;reason:string|null};

export function evaluateWhatsAppWindow(latestCustomerAt:string|null,now:Date,windowHours=24):WhatsAppWindowDecision{
  if(!latestCustomerAt)return{allowed:false,reason:'CUSTOMER_TIMESTAMP_MISSING'};
  const customerAt=new Date(latestCustomerAt);
  if(Number.isNaN(customerAt.getTime()))return{allowed:false,reason:'CUSTOMER_TIMESTAMP_INVALID'};
  const windowMs=Math.max(0,windowHours)*60*60*1000;
  const ageMs=now.getTime()-customerAt.getTime();
  if(ageMs<0)return{allowed:true,reason:null};
  return ageMs<=windowMs?{allowed:true,reason:null}:{allowed:false,reason:'WHATSAPP_WINDOW_CLOSED'};
}
