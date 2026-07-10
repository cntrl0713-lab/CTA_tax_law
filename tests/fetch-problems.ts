import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

const targetIds = [2, 12, 22, 32, 42, 52]

async function main() {
    const { data: problems, error } = await supabase
        .from('cta_problem')
        .select(`
            id,
            title
        `)

    if (error) {
        console.error('Error fetching data:', error)
        return
    }

    console.log(problems.map(p => `${p.id}: ${p.title}`).join('\n'))
}

main().catch(console.error)
