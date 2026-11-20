import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

export async function compressAndUpload(file: File, folder: 'wall' | 'market', userId: string): Promise<string> {
  if (!supabase) throw new Error('Image uploads need a connected Supabase project.')
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp',
  })
  const path = `${userId}/${folder}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from('campus-uploads').upload(path, compressed, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from('campus-uploads').getPublicUrl(path).data.publicUrl
}
