import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DashServiceType,
  ServiceManagerService
} from '../../services';
import { filterEmptyNullOrUndefinedProperties } from '../../util/misc-util';
import { QueryParams } from '../../util/query-params.interface';
import {
  AggregateQueryParams, DeploymentAPIResponse
} from '../deployment/deployment.model';
import { CURRENT_TIMEZONE, SidebarChoice } from '../../util/constants';
import { APIVersion } from '../../util/apiversion';

@Injectable({
  providedIn: 'root',
})
export class DoraMetricsService {
  selectedPriorityType: string;
  DEPLOYMENTS = 'deployments';
  deploymentServicesList = [];

  constructor(
    private readonly http: HttpClient,
    private readonly serviceManagerService: ServiceManagerService
  ) {
  }

  getPriorities(params: QueryParams): Observable<any> {
    return this.getDataFromDoraServices('priorities', params as HttpParams);
  }

  private getDataFromDoraServices(
    path: string,
    params: HttpParams
  ): Observable<any[] | any> {
    params['timezone'] = CURRENT_TIMEZONE;
    const devSecOpsServices = this.getDoraServices();

    if (devSecOpsServices.length) {
      const aggregateData$ = devSecOpsServices.map((service) => {
        this.removePreviousDaysOnCustomDateSelection(params, params);
        return this.http
          .get(`${this.serviceManagerService.getBaseUrl(service.url)}${path}`, {
            params: filterEmptyNullOrUndefinedProperties(params),
          })
          .pipe(catchError((_res) => of(null)));
      });
      return forkJoin(aggregateData$);
    } else {
      return of([]);
    }
  }

  getMttrDataAggregates(params: QueryParams): Observable<any> {
    return this.getDataFromDoraServices('incidentAggregates/charts', params as HttpParams);
  }

  getMttrTableAggregates(params: QueryParams): Observable<any> {
    return this.getDataFromDoraServices('incidentAggregates', params as HttpParams);
  }

  private getDoraServices() {
    return this.serviceManagerService.getIncidentServices();
  }

  getCfrTableAggregates(params: QueryParams): Observable<any> {
    return this.getDataFromDoraServices('cfrAggregates', params as HttpParams);
  }

  getCfrDataAggregates(params: QueryParams): Observable<any> {
    return this.getDataFromDoraServices('cfrAggregates/charts', params as HttpParams);
  }

  getDeploymentServices() {
    const response = this.serviceManagerService.getDashServicesByType(
      DashServiceType.DEPLOY
    );
    return response.map((item) => {
      return item;
    });
  }

  getAllDeploymentStatusAggregate(params, isFromOverview = false) {
    return this.getAggregates(params, isFromOverview);
  }

  getAggregates(params: AggregateQueryParams, isFromOverview) {
    const deploymentList = [];
    const finalParams = this.convertQueryParams(params);

    if (!isFromOverview) {
      finalParams['limit'] = params.limit ? params.limit : 100;
      finalParams['timezone'] = CURRENT_TIMEZONE;
    }

    this.deploymentServicesList = this.getDeploymentServices();

    this.deploymentServicesList.forEach((service) => {
      const serviceUrl = this.serviceManagerService.getBaseUrl(service.url);

      if (service && service.service_id) {
        deploymentList.push(
          this.getDeploymentAggregatesChartsResponse(serviceUrl, finalParams)
        );
      }
    });
    return forkJoin(deploymentList);
  }

  getDeploymentAggregatesChartsResponse(serviceUrl, finalParams) {
    return this.http
      .get(serviceUrl + 'deploymentAggregates/charts', {
        params: finalParams,
      })
      .pipe(catchError(_error => of(null)));
  }

  getChangeLeadTimeChartData(params): any {
    const deploymentBarsList = [];
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    this.deploymentServicesList = this.getDeploymentServices();

    this.deploymentServicesList.forEach((deployService) => {
      if (deployService && deployService.service_id === 'deployments') {
        deploymentBarsList.push(
          this.getChangeLeadTimeChartAggregate(finalParams)
        );
      }
    });

    return forkJoin(deploymentBarsList);
  }

  getChangeLeadTimeChartAggregate(finalParams) {
    return this.http
      .get(
        `${APIVersion.DASH_API_BASE}/insightscontroller/v1/issueLeadTimeChangeAggregate/chartV2`,
        {
          params: finalParams,
        }
      )
      .pipe(catchError(_error => of(null)));
  }

  getChangeLeadTimeTableDetails(params) {
    const finalParams = this.convertQueryParams(params);
    if (params.firstCommitDate) {
      finalParams['firstCommitDate'] = params.firstCommitDate;
    }

    if (params.deploymentDate) {
      finalParams['deploymentDate'] = params.deploymentDate;
    }

    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/insightscontroller/v1/issueSnapShotDetails`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/insightscontroller/v1/issueSnapShotDetails`
      );
    }
  }

  convertQueryParams(queryParams: AggregateQueryParams) {
    let finalParams = {};
    if (+queryParams.offset > -1) {
      finalParams['offset'] = '' + queryParams.offset;
    }
    if (queryParams.limit) {
      finalParams['limit'] = '' + queryParams.limit;
    }
    if (queryParams.aggregateMode === 'latest') {
      finalParams['period'] = '' + queryParams.aggregateMode;
    }
    if (queryParams.isDeploySuccess) {
      finalParams['isDeploySuccess'] = queryParams.isDeploySuccess;
    }

    const params = this.setQueryParams(queryParams);
    const filters = this.setFilterList(queryParams);
    finalParams = { ...finalParams, ...params, ...filters };
    /*
     *   custom date range filter support
     */
    if (queryParams.fromDate) {
      finalParams['fromDate'] = queryParams.fromDate;
    }

    if (queryParams.toDate) {
      finalParams['toDate'] = queryParams.toDate;
    }

    this.removePreviousDaysOnCustomDateSelection(queryParams, finalParams);

    return finalParams;
  }

  removePreviousDaysOnCustomDateSelection(queryParams, finalParams) {
    if (
      queryParams.fromDate &&
      queryParams.toDate &&
      finalParams['previousDays']
    ) {
      delete finalParams['previousDays'];
    }

  }

  setQueryParams(queryParams) {
    const finalParams = {};
    if (queryParams.previousDays) {
      finalParams['previousDays'] = '' + queryParams.previousDays;
    }

    if (queryParams.aggregateMode !== 'latest' && queryParams.previousDays) {
      finalParams['previousDays'] = '' + queryParams.previousDays;
    }

    if (queryParams.search) {
      finalParams['search'] = queryParams.search;
    }

    if (queryParams.failurerate) {
      finalParams['failurerate'] = queryParams.failurerate;
    }

    if (queryParams.orderBy) {
      finalParams['orderBy'] = queryParams.orderBy.replace('_', '');
    }

    if (queryParams.sortOrder) {
      finalParams['sortOrder'] = queryParams.sortOrder;
    }

    if (queryParams.groupBy) {
      finalParams['groupBy'] = queryParams.groupBy;
    }

    if(queryParams.isLinesChanged){
      finalParams['isLinesChanged'] = queryParams.isLinesChanged;
    } 

    if(queryParams.reviewedByFilterList){
      finalParams['reviewedByFilterList'] = queryParams.reviewedByFilterList;
    } 
    return finalParams;
  }

  setFilterList(queryParams) {
    const finalParams = {};
    if (queryParams.application) {
      finalParams['application'] = queryParams.application;
    }

    if (queryParams.environment) {
      finalParams['environment'] = queryParams.environment;
    }

    if (queryParams.status) {
      finalParams['status'] = queryParams.status;
    }

    if (queryParams.isProduction) {
      finalParams['isProduction'] = queryParams.isProduction;
    }

    if (queryParams.historyDays) {
      finalParams['historyDays'] = queryParams.historyDays;
    }

    if (queryParams.excludeEmptyApplications) {
      finalParams['excludeEmptyApplications'] = true;
    }

    if (queryParams.excludeEmptyTechnicalServices) {
      finalParams['excludeEmptyTechnicalServices'] = true;
    }

    if (queryParams.technicalServiceFilterList) {
      finalParams['technicalServiceFilterList'] = queryParams.technicalServiceFilterList;
    }

    if(queryParams.decryptCode){
      finalParams['decryptCode'] = queryParams.decryptCode;
    } 

    if(queryParams.createdByFilterList){
      finalParams['createdByFilterList'] = queryParams.createdByFilterList;
    } 

    if(queryParams.isLinesChanged){
      finalParams['isLinesChanged'] = queryParams.isLinesChanged;
    } 

    if(queryParams.reviewedByFilterList){
      finalParams['reviewedByFilterList'] = queryParams.reviewedByFilterList;
    } 

    return finalParams;
  }

  //get the list of all deployments
  getAllDeployments(
    params: AggregateQueryParams
  ): Observable<DeploymentAPIResponse[]> {
    const deploymentList$: Observable<DeploymentAPIResponse>[] = [];
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    this.deploymentServicesList = this.getDeploymentServices();

    this.deploymentServicesList.forEach(service => {
      deploymentList$.push(
        <Observable<DeploymentAPIResponse>>
        this.http
          .get(
            this.serviceManagerService.getBaseUrl(service.url) +
            this.DEPLOYMENTS,
            {
              params: finalParams,
            }
          )
          .pipe(catchError(_error => of(null)))
      );
    });
    return forkJoin(deploymentList$);
  }

  getCommitFrequencyChartData(params: QueryParams) {
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationCommitFrequency/chart`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationCommitFrequency/chart`);
    }
  } 

   getCommitFrequencyTableData(params: QueryParams) {
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/commitFrequencyViewDetails`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/commitFrequencyViewDetails`);
    }
  }

  getNewDeveloperParams(params): string {
    const developParams = [];

    const paramKeys = [
      'application',
      'previousDays',
      'fromDate',
      'toDate',
      'technicalServiceFilterList',
      'groupBy',
      'isLinesChanged',
      'decryptCode',
      'timezone',
    ];

    for (const key of paramKeys) {
      if (params[key]) {
        developParams.push(`${key}=${params[key]}`);
      }
    }
    return developParams.length > 0 ? `?${developParams.join('&')}` : '';
  }

  getDeveloperCommitFrequency(params: any, developers: any[]) {
    const paramUrl = this.getNewDeveloperParams(params);
    return this.http.post(
      `${APIVersion.DASH_API_BASE}/develop/v3/developerCommitFrequency/chart${paramUrl}`,
      developers 
    );
  }

  developersListData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/developers`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/developers`);
    }
  }

  technicalServicesListData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/technicalServices`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/technicalServices`);
    }
  }

  applicationPRTimeToMergeChartData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationPRTimeToMerge/chart`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationPRTimeToMerge/chart`);
    }
  }

  appLevelLinesandFilesChangedChartData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationPRTimeToMerge/barChart`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationPRTimeToMerge/barChart`);
    }
  }

  durationDeveloperLevelLinesandFilesChangedChartData(params: QueryParams, developers: any[]){
    const paramUrl = this.getNewDeveloperParams(params);
    return this.http.post(
      `${APIVersion.DASH_API_BASE}/develop/v3/developerPRTimeToMerge/chart${paramUrl}`,
      developers 
    );
  }

  developersPRTimeToMergeChartData(params: QueryParams, developers: any[]){
    const paramUrl = this.getNewDeveloperParams(params);
    return this.http.post(
      `${APIVersion.DASH_API_BASE}/develop/v3/developerPRTimeToMerge/barChart${paramUrl}`,
      developers 
    );
  }

  applicationsPRsizeChartData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationPRSize/chart`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationPRSize/chart`);
    }
  }

  developersPRsizeChartData(params: QueryParams, developers: any[]){
    const paramUrl = this.getNewDeveloperParams(params);
    return this.http.post(
     `${APIVersion.DASH_API_BASE}/develop/v3/developerPRSize/chart${paramUrl}`,
      developers 
    );

  }

  pullRequestSizeViewDetailsData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/prSizeViewDetails`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/prSizeViewDetails`);
    }
  }

  fetchCodeReviewVelocityApplicationChartData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationCodeReviewVelocity/chart`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationCodeReviewVelocity`);
    }
   }

   fetchCodeReviewVelocityDeveloperChartData(params: QueryParams, reviewers: any[]){
    const paramUrl = this.getNewDeveloperParams(params);
    return this.http.post(
      `${APIVersion.DASH_API_BASE}/develop/v3/developerCodeReviewVelocity/chart${paramUrl}`,
      reviewers 
    );
   }

   fetchCodeReviewVelocityDetailstableData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/codeReviewVelocityViewDetails`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/codeReviewVelocityViewDetails`);
    }
   }

   fetchPullRequestTimeToMergeDetails(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/prTimeToMergeViewDetails`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/prTimeToMergeViewDetails`);
    }
   }

   fetchCodeReviewEfficiencyAppLevelChartData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationCodeReviewEfficiency/chart`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/applicationCodeReviewEfficiency/chart`);
    }
   }

   fetchCodeReviewEfficiencyDeveloperLevelChartData(params: QueryParams, reviewers: any[]){
    const paramUrl = this.getNewDeveloperParams(params);
    return this.http.post(
      `${APIVersion.DASH_API_BASE}/develop/v3/developerCodeReviewEfficiency/chart${paramUrl}`,
      reviewers 
    );
   }

   fetchCodeReviewEfficiencyDetailsTableData(params: QueryParams){
    const finalParams = this.convertQueryParams(params);
    finalParams['timezone'] = CURRENT_TIMEZONE;
    if (finalParams) {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/codeReviewEfficiencyViewDetails`,
        {
          params: finalParams,
        }
      );
    } else {
      return this.http.get(
        `${APIVersion.DASH_API_BASE}/develop/v3/codeReviewEfficiencyViewDetails`);
    }
   }


}
