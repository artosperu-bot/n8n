type RecordLike=Record<string,unknown>;

export type WhatsAppInboundMessage={
  provider:'whatsapp';
  direction:'inbound';
  waMessageId:string;
  waId:string;
  phoneNumberId:string|null;
  displayPhoneNumber:string|null;
  type:string;
  text:string|null;
  timestamp:string|null;
  contactName:string|null;
};

export type WhatsAppStatusEvent={
  messageId:string;
  status:string;
  timestamp:string|null;
  recipientId:string|null;
  phoneNumberId:string|null;
};

export type WhatsAppWebhookParseResult={
  messages:WhatsAppInboundMessage[];
  statuses:WhatsAppStatusEvent[];
  changeCount:number;
};

function record(value:unknown):RecordLike|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as RecordLike:null;}
function array(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function text(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null;}

export function verifyWhatsAppWebhook(query:URLSearchParams,expectedToken:string|undefined):{ok:boolean;challenge?:string}{
  const mode=query.get('hub.mode');
  const token=query.get('hub.verify_token');
  const challenge=query.get('hub.challenge');
  const valid=mode==='subscribe'&&Boolean(expectedToken)&&token===expectedToken&&challenge!==null;
  return valid?{ok:true,challenge}:{ok:false};
}

export function parseWhatsAppWebhook(payload:unknown):WhatsAppWebhookParseResult{
  const messages:WhatsAppInboundMessage[]=[];
  const statuses:WhatsAppStatusEvent[]=[];
  let changeCount=0;
  const root=record(payload);
  if(!root)return{messages,statuses,changeCount};

  for(const entryValue of array(root.entry)){
    const entry=record(entryValue);if(!entry)continue;
    for(const changeValue of array(entry.changes)){
      changeCount+=1;
      const change=record(changeValue);const value=record(change?.value);if(!value)continue;
      const metadata=record(value.metadata);
      const phoneNumberId=text(metadata?.phone_number_id);
      const displayPhoneNumber=text(metadata?.display_phone_number);
      const contacts=array(value.contacts).map(record).filter((item):item is RecordLike=>Boolean(item));

      for(const messageValue of array(value.messages)){
        const message=record(messageValue);if(!message)continue;
        const waMessageId=text(message.id);const waId=text(message.from);const type=text(message.type)??'unknown';
        if(!waMessageId||!waId)continue;
        const contact=contacts.find(item=>text(item.wa_id)===waId)??contacts[0]??null;
        const profile=record(contact?.profile);
        const messageText=type==='text'?text(record(message.text)?.body):null;
        messages.push({
          provider:'whatsapp',direction:'inbound',waMessageId,waId,phoneNumberId,displayPhoneNumber,
          type,text:messageText,timestamp:text(message.timestamp),contactName:text(profile?.name),
        });
      }

      for(const statusValue of array(value.statuses)){
        const status=record(statusValue);if(!status)continue;
        const messageId=text(status.id);const statusName=text(status.status);
        if(!messageId||!statusName)continue;
        statuses.push({messageId,status:statusName,timestamp:text(status.timestamp),recipientId:text(status.recipient_id),phoneNumberId});
      }
    }
  }
  return{messages,statuses,changeCount};
}
