import { describe, expect, it } from 'vitest'
import { projectUrl } from './db'

describe('adresa projekta', () => {
  it('uzima samo početni dio adrese', () => {
    expect(projectUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co')
    expect(projectUrl(' https://abc.supabase.co/rest/v1/ ')).toBe('https://abc.supabase.co')
    expect(projectUrl('abc.supabase.co')).toBe('https://abc.supabase.co')
    expect(projectUrl('abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co')
  })
  it('odbija neispravne vrijednosti', () => {
    expect(projectUrl('')).toBe('')
    expect(projectUrl(undefined)).toBe('')
    expect(projectUrl('abc')).toBe('')
    expect(projectUrl('https://')).toBe('')
  })
})
