export type StatsPeriod = 'weekly' | 'monthly' | 'all'

export interface SubjectStats {
    subjectId: number
    subjectName: string
    awardedSum: number
    maxSum: number
    /** awardedSum / maxSum (maxSum=0이면 0) */
    ratio: number
    count: number
}

export interface StatsResponse {
    period: StatsPeriod
    overall: SubjectStats & { subjectId: -1; subjectName: '전체' }
    bySubject: SubjectStats[]
}
